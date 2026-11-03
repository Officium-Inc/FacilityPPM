# Supabase Authorization Patterns (FacilityPPM)

How to apply the invariants in [../SKILL.md](../SKILL.md) with this codebase's Supabase setup.

## Clients

| Factory | File | Key | RLS | Use for |
|---|---|---|---|---|
| `createClient()` (server) | `lib/supabase/server.ts` | anon + user cookies | **applies** | `auth.getUser()`, user-scoped reads |
| `createServiceClient()` | `lib/supabase/server.ts` | service role | **bypassed** | privileged writes/reads **after** app-layer authz, `auth.admin.*` |
| `createClient()` (browser) | `lib/supabase/client.ts` | anon + user session | **applies** | `'use client'` components only |

The service client must stay the raw `@supabase/supabase-js` client (no cookies) — see AGENTS.md bug history.
Because the browser has the anon key and the user's JWT, **RLS is the real boundary for anything the
browser can reach**; route handlers are a second layer, not a substitute.

## Identity and claims

- `app_metadata` (service-role writable only): `role` (`'provider'` or absent), `property_id`/`property_slug`
  (active), `property_ids[]`/`property_slugs[]` (all memberships).
- Per-property role: `engineers (user_id, property_id, role_id, is_active) → roles.name`, normalized by
  `normalizeRoleName()` in `lib/roles.ts`.
- `user_metadata` is user-editable — **never** use it for authorization (display name only).
- JWT claims are stale until the session refreshes. For revocation-sensitive checks (removed from property,
  deactivated, role changed) read the `engineers` row, not only the JWT.
- Changing `app_metadata`: only server-side via `service.auth.admin.updateUserById()` after authz; merge
  arrays (never overwrite `property_ids`); never let a property admin set `role: 'provider'`.

## Existing authorization helpers

| Helper | File | Checks |
|---|---|---|
| `authorizeWorkOrderStaff(service, user, propertyId)` | `lib/work-order-access.ts` | provider, or property member with non-tenant/non-viewer role |
| `canViewWorkOrder(service, user, wo)` | `lib/work-order-access.ts` | provider, staff of property, or tenant who submitted it |
| `resolveTenantSubmitter(service, user, slug?)` | `lib/tenant-submit.ts` | slug ∈ `property_slugs`, active tenant member |
| `requireMondayPropertyAdmin()` | `lib/monday/auth.ts` | authn + provider or `admin`/`property_manager` |
| `getTenantPortalContext(slug)` | `lib/tenant.ts` | authn, license, active tenant member (pages) |
| `resolveWorkOrderActor(service, user, propertyId)` | `lib/work-order-events.ts` | resolves role only — **not** an authz check by itself; no `is_active` check |
| local `requireProvider()` | `app/api/provider/**` | authn + `app_metadata.role === 'provider'` |

For the rewrite, prefer one central helper, e.g. `authorize(user, { propertyId, roles, record })`, that
returns `{ ok, actor }` or `{ ok: false, status, error }` and enforces membership, `is_active`, license,
role and record scope (company / assignment) in one place.

## API route template

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { authorizeWorkOrderStaff } from '@/lib/work-order-access'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params

  // 1. Authenticate (server-validated)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 2. Load the target record's scope with the service client (ids only)
  const service = await createServiceClient()
  const { data: wo } = await service.from('work_orders').select('id, property_id').eq('id', id).maybeSingle()
  if (!wo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // 3. Authorize against the RECORD's property + the caller's role there
  const access = await authorizeWorkOrderStaff(service, user, wo.property_id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  // 4. Validate input; never take property_id / role / company_id from the body
  const body = await request.json().catch(() => null)
  // ...validate body...

  // 5. Privileged write, constrained to the authorized record
  const { error } = await service.from('work_orders').update({ /* allowed fields */ }).eq('id', wo.id)
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

Rules: return 404 (not 403) when revealing existence would leak cross-tenant data; don't echo raw DB
error messages to tenants; validate enums/IDs; whitelist updatable columns.

## Public token flows (sign-off, costing approval, invite)

- Token: `crypto.randomUUID()` or 32 random bytes; store a **SHA-256 hash** and look up by hash.
- Enforce expiry and single use **atomically**, e.g.
  `update … set used_at = now() where token_hash = $1 and used_at is null and expires_at > now() returning …`
  — a read-then-write sequence allows double use under concurrency.
- Scope to one record; return only fields the signer needs (no internal notes, costs of other jobs, emails).
- Clear the token after use; rotate on resend; rate-limit the endpoint.
- Never expose token tables through RLS (`USING (true)`, `token IS NOT NULL`); token routes use the service
  client after validating the token.

## RLS templates

Put helper functions in a **non-exposed** schema, `security definer`, `set search_path = ''`, and call them
through `(select …)` / `in (select …)` so Postgres evaluates them once per statement.

```sql
create schema if not exists private;
grant usage on schema private to authenticated;

-- Properties where the caller is an active member holding one of the given roles
create or replace function private.property_ids_with_role(allowed text[])
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select e.property_id
  from public.engineers e
  join public.roles r on r.id = e.role_id
  join public.properties p on p.id = e.property_id
  where e.user_id = (select auth.uid())
    and e.is_active
    and r.name = any (allowed)
    and p.license_status <> 'suspended'
$$;
revoke all on function private.property_ids_with_role(text[]) from public;
grant execute on function private.property_ids_with_role(text[]) to authenticated;

create or replace function private.is_provider()
returns boolean language sql stable
as $$ select coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'provider' $$;

-- The caller's active engineer rows (used for Service Group assignment checks)
create or replace function private.my_engineer_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select e.id from public.engineers e
  where e.user_id = (select auth.uid()) and e.is_active
$$;

-- Companies the caller belongs to as an active tenant (requires engineers.company_id in the rewrite)
create or replace function private.my_company_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select e.company_id
  from public.engineers e
  join public.roles r on r.id = e.role_id
  where e.user_id = (select auth.uid()) and e.is_active and r.name = 'tenant' and e.company_id is not null
$$;

revoke all on function private.my_engineer_ids() from public;
revoke all on function private.my_company_ids() from public;
grant execute on function private.my_engineer_ids() to authenticated;
grant execute on function private.my_company_ids() to authenticated;
```

```sql
alter table public.work_orders enable row level security;

-- Staff: whole property
create policy "staff read work orders" on public.work_orders
  for select to authenticated
  using (
    property_id in (select private.property_ids_with_role(array['admin','property_manager','head_engineer']))
    or (select private.is_provider())
  );

-- Service Group: only assigned work
create policy "service group read assigned" on public.work_orders
  for select to authenticated
  using (engineer_id in (select private.my_engineer_ids()));

-- Tenant: only their company's requests (requires company_id, see portal-role-matrix.md)
create policy "tenant read own company" on public.work_orders
  for select to authenticated
  using (company_id in (select private.my_company_ids()));

-- Writes normally go through route handlers with the service client; if the browser must write,
-- add explicit INSERT/UPDATE policies with both USING and WITH CHECK on the same scope.
```

Avoid: `auth.role() = 'authenticated'` as the only predicate, `USING (true)` / `WITH CHECK (true)` for
`anon`/`authenticated`, `token IS NOT NULL`, `user_metadata`, views without `security_invoker = true`,
`SECURITY DEFINER` functions in `public`, and policies that check only the JWT `property_id` claim for
data tenants must not see.

## Storage

- Object paths start with `<property_id>/` (and `<work_order_id>/` beneath); storage policies check the
  first path segment against the caller's properties/roles.
- Re-validate any client-supplied URL/path with a prefix check (see `sanitizeServiceReportPhotoUrls`).
- Prefer signed URLs for tenant documents over public buckets.

## Review checklist

- [ ] `auth.getUser()` before anything else (or a helper that does it)
- [ ] Property of the **record** checked against the caller's memberships
- [ ] Role checked against the matrix; tenant company / service-group assignment checked
- [ ] `is_active` and license status enforced
- [ ] Service client used only after the checks; updates constrained by id and allowed columns
- [ ] No authz input from body/query/headers/`user_metadata`
- [ ] New tables: RLS enabled + role-aware policies in the same migration
- [ ] Token routes: hash, expiry, atomic single use, minimal response
- [ ] Audit script shows no new HIGH findings
