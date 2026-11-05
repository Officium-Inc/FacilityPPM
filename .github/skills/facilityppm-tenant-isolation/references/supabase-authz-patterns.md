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

## Authorization module (`lib/authz/`)

| Export | File | Use |
|---|---|---|
| `PERMISSIONS`, `can(actor, action, record?)`, `assignableRoles`, `canManageMember` | `permissions.ts` | The matrix in code; pure, also used by client components for menus/buttons |
| `resolveMembership` / `resolveActor`, `actorLog`, `userPropertyIds` | `actor.ts` | Provider, or active member with a current role (reads the `engineers` row, not only the JWT) |
| `requireSession()`, `authorize(session, action, { record \| propertyId })`, `requireProvider()` | `guard.ts` | Route handlers; checks membership, `is_active`, license and the role's scope on the record |
| `requirePage(slug, action)`, `requirePageRecord(slug, action, record)`, `requireProviderPage()` | `guard.ts` | Server components; redirect/404 instead of rendering |
| `WORK_ORDER_SCOPE_COLUMNS` | `records.ts` | Columns every work order query selects before authorizing |
| `authorizeTenantSubmit(session, slug)` | `lib/tenant-submit.ts` | Tenant work request submission |
| `requireMondayPropertyAdmin()` | `lib/monday/auth.ts` | Monday integration settings |

## API route template

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { authorize, requireSession } from '@/lib/authz/guard'
import { actorLog } from '@/lib/authz/actor'
import { WORK_ORDER_SCOPE_COLUMNS } from '@/lib/authz/records'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params

  // 1. Authenticate (server-validated getUser) and get a service client
  const session = await requireSession()
  if (!session.ok) return session.response
  const { service } = session

  // 2. Load the target record with its scope columns
  const { data: wo } = await service.from('work_orders').select(`${WORK_ORDER_SCOPE_COLUMNS}, status`).eq('id', id).maybeSingle()
  if (!wo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // 3. Authorize the action against the RECORD (its property + the role's scope there)
  const access = await authorize(session, 'workRequest.review', { record: wo })
  if (!access.ok) return access.response

  // 4. Validate input; never take property_id / role / company_id from the body
  const body = await request.json().catch(() => null)
  // ...validate body...

  // 5. Privileged write, constrained to the authorized record
  const { error } = await service.from('work_orders').update({ /* allowed fields */ }).eq('id', wo.id)
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  return NextResponse.json({ ok: true, by: actorLog(access.actor).actorName })
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
