# Supabase Authorization Patterns (FacilityPPM)

How to apply the invariants in [../SKILL.md](../SKILL.md) with this codebase's Supabase setup.

## Clients

| Factory | File | Key | RLS | Use for |
|---|---|---|---|---|
| `createClient()` (server) | `lib/supabase/server.ts` | anon + user cookies | **applies** | `auth.getUser()` (inside `requireSession()` / `getCurrentUser()`), own-row reads |
| `createServiceClient()` | `lib/supabase/server.ts` | service role | **bypassed** | every read/write **after** `lib/authz` checks, `auth.admin.*`, storage |
| `createClient()` (browser) | `lib/supabase/client.ts` | anon + user session | **applies** | `'use client'` components, **auth only** |

The service client must stay the raw `@supabase/supabase-js` client (no cookies) — see AGENTS.md bug history.
The browser has the anon key and the user's JWT, so the Data API is reachable directly. Since migration 022
`authenticated` can only SELECT (role-aware policies, D25) and `anon` nothing; storage is private (023). That
makes **route handlers the write boundary** and RLS the read boundary for direct Data API access — both must
follow the matrix.

## Identity and claims

- `app_metadata` (service-role writable only): `role` (`'provider'` or absent), `property_id`/`property_slug`
  (active), `property_ids[]`/`property_slugs[]` (all memberships), `terminated_property_ids[]` (D23).
- Per-property role: `engineers (user_id, property_id, role_id, is_active, company_id) → roles.name`,
  normalized by `normalizeRoleName()` in `lib/roles.ts` (SQL mirror: `private.my_memberships()`).
- `user_metadata` is user-editable — **never** use it for authorization (display name only).
- JWT claims are stale until the session refreshes. For revocation-sensitive checks (removed from property,
  deactivated, role changed) read the `engineers` row, not only the JWT — `resolveMembership()` does.
- Changing `app_metadata`: only server-side via `service.auth.admin.updateUserById()` after authz; merge
  arrays (`grantPropertyAccess()` / `revokePropertyAccess()` in `lib/auth-users.ts`); never let a property
  admin set `role: 'provider'`.

## Authorization module (`lib/authz/`)

| Export | File | Use |
|---|---|---|
| `PERMISSIONS`, `can(actor, action, record?)`, `assignableRoles`, `canManageMember`, `isUnlinkedTenant` | `permissions.ts` | The matrix in code; pure, also used by client components for menus/buttons |
| `resolveMembership` / `resolveActor`, `actorLog`, `actorEngineerId`, `userPropertyIds` | `actor.ts` | Provider, or active member with a current role (reads the `engineers` row, not only the JWT) |
| `requireSession()`, `authorize(session, action, { record \| propertyId })`, `authorizeForSlug()`, `requireProvider()` | `guard.ts` | Route handlers; checks membership, `is_active`, license and the role's scope on the record |
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

Implemented in `lib/token.ts` (D27, migration 024):

```ts
// Issue: only the hash is stored; the raw token goes into the email
const token = generateLinkToken()                      // 32 random bytes, base64url
await service.from('work_orders').update({ sign_off_token_hash: hashToken(token), sign_off_expires_at }).eq('id', wo.id)

// Redeem
if (!isPlausibleToken(token)) return NextResponse.json({ error: 'Invalid or expired token.' }, { status: 404 })
const { data: wo } = await service.from('work_orders').select(SIGN_OFF_DECISION_COLUMNS)
  .eq('sign_off_token_hash', hashToken(token)).maybeSingle()
```

- Enforce expiry and single use **atomically**: decisions in `lib/approvals.ts` are conditional updates that
  require the record to still be waiting (D22); invitations are claimed with `.is('used_at', null)`.
  A read-then-write sequence allows double use under concurrency.
- Scope to one record; return only fields the signer needs (no internal notes, costs of other jobs, emails).
- After an approval the status moves on, so the conditional update rejects the link; a rejection that
  re-opens the work clears the hash. Rotate on resend; never return the token or its hash to the browser.
- Never expose token tables through RLS (`USING (true)`, `token IS NOT NULL`); token routes use the service
  client after validating the token. The raw columns stay null (CHECK constraints).

## RLS templates

The helpers live in the **non-exposed** `private` schema (migration 022): `security definer`,
`set search_path = ''`, `revoke … from public, anon`, `grant execute … to authenticated, service_role`. Call
them through `(select …)` / `in (select …)` so Postgres evaluates them once per statement.

| Helper | Returns |
|---|---|
| `private.is_provider()` | `app_metadata.role = 'provider'` |
| `private.my_memberships()` | `(property_id, engineer_id, role, company_id)` of the caller's active memberships with a current role, in properties with a usable license that are in `app_metadata.property_ids`; `company_id` only for active companies |
| `private.staff_property_ids()` | Properties where the caller is Administrator, Property Manager or Head Engineer |
| `private.manager_property_ids()` | Properties where the caller is Administrator or Property Manager |
| `private.member_property_ids()` | Properties where the caller has any current role |
| `private.assigned_work()` | `(property_id, engineer_id)` of the caller's Service Group memberships |
| `private.tenant_company_ids()` | Companies of the caller's tenant memberships |
| `private.my_engineer_ids()` | The caller's own member rows |

A new property-scoped table:

```sql
alter table public.things enable row level security;

-- Staff see the property; tenants see rows of their company (drop the clauses the matrix does not allow)
create policy "Role-scoped read things" on public.things
  for select to authenticated
  using (
    (select private.is_provider())
    or property_id in (select private.staff_property_ids())
    or company_id in (select private.tenant_company_ids())
  );

create index if not exists idx_things_property on public.things (property_id);
```

Assigned work (Service Group) and child tables:

```sql
-- Service Group: only work orders assigned to them, in the property of that membership
or (property_id, engineer_id) in (select aw.property_id, aw.engineer_id from private.assigned_work() aw)

-- Rows that belong to a work order are visible exactly when the work order is (work_orders RLS applies)
create policy "Read with work order" on public.work_order_things
  for select to authenticated
  using (work_order_id in (select w.id from public.work_orders w));
```

No INSERT/UPDATE/DELETE policies: writes go through route handlers with the service client, and 022 revokes
write privileges from `anon`/`authenticated` (including default privileges for new tables). Add the table to
`supabase/tests/rls_check.sql` and run it on staging.

Avoid: `auth.role() = 'authenticated'` as the only predicate, `USING (true)` / `WITH CHECK (true)` for
`anon`/`authenticated`, `token IS NOT NULL`, `user_metadata`, views without `security_invoker = true`,
`SECURITY DEFINER` functions in `public`, and policies that check only the JWT `property_id` claim for
data tenants must not see.

## Storage

- Buckets are private with no storage policies (migration 023, D26); only the service role reads/writes.
- Object paths: `<property>/<work order>/<file>`, `service-reports/<property>/<member>/<file>`,
  `receipts/<WO number>-<work order>.pdf`, `audit-reports/<WO number>-<work order>.pdf`.
  `fileOwnerFromPath()` (`lib/storage-urls.ts`) maps each shape to the owning record — extend it for new shapes.
- The database keeps the public-object URL as an identifier. Browsers get:
  `withFileRouteUrls()` / `fileRouteUrl()` → `/api/files/<bucket>/<path>` (authorizes `workRequest.view`,
  redirects to a 60 s signed URL), or `withSignedFileUrls()` (1 h) on public token pages. Server code uses
  `downloadStoredFile()`.
- Re-validate any client-supplied URL/path: convert with `toStoredFileUrl()` and prefix-check
  (`sanitizeWorkOrderFileUrls`, `sanitizeServiceReportPhotoUrls`).

## Review checklist

- [ ] `auth.getUser()` before anything else (or a helper that does it)
- [ ] Property of the **record** checked against the caller's memberships
- [ ] Role checked against the matrix; tenant company / service-group assignment checked
- [ ] `is_active` and license status enforced
- [ ] Service client used only after the checks; updates constrained by id and allowed columns
- [ ] No authz input from body/query/headers/`user_metadata`
- [ ] New tables: RLS enabled + read-only role-aware policy in the same migration; `rls_check.sql` extended
- [ ] Files: no stored URL reaches the browser unconverted; new path shapes in `fileOwnerFromPath()`
- [ ] Token routes: hash only, expiry, atomic single use, minimal response, no token/hash in responses
- [ ] Audit script shows no new HIGH findings
