# FacilityPPM — Agent Customization Guide

This file contains essential codebase knowledge for AI coding agents working in this repository.

---

## Build, Dev & Verification Commands

```bash
pnpm dev            # Start dev server on localhost:3000
pnpm build          # Production build (output: standalone)
pnpm start          # Start production server
pnpm lint           # Run ESLint
pnpm typecheck      # tsc --noEmit (preferred over build for quick validation)
pnpm test           # Vitest (tests/**)
pnpm audit:tenant   # Tenant-isolation audit, exits 1 on HIGH findings
```

Run `pnpm typecheck`, `pnpm test` and `pnpm audit:tenant` before finishing any change; run `pnpm build` for
changes to routes, pages or config.

**Windows notes**
- `%APPDATA%\npm` must be in PATH for pnpm to resolve. Without pnpm, call the tools directly:
  `node node_modules\typescript\bin\tsc --noEmit -p tsconfig.json`, `node node_modules\vitest\vitest.mjs run`,
  `node .github\skills\facilityppm-tenant-isolation\scripts\audit-tenant-isolation.mjs --strict`,
  `$env:NEXT_TELEMETRY_DISABLED='1'; node node_modules\next\dist\bin\next build`.
- If `next build` fails with `EINVAL readlink .next\...`, delete `.next` and rebuild (OneDrive quirk).
- `tsconfig.tsbuildinfo` changes on every typecheck — don't commit it (`git checkout -- tsconfig.tsbuildinfo`).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14.2.x — App Router, TypeScript strict |
| Language | TypeScript 5 (`tsconfig.json` strict mode) |
| Styling | Tailwind CSS 3.4.x + PostCSS (ESM: `postcss.config.mjs`) |
| Database | Supabase (PostgreSQL) with Row Level Security |
| Auth | `@supabase/ssr` + `@supabase/supabase-js` |
| Storage | Supabase Storage, **private** buckets (`receipts`; legacy `evidence`) |
| Email | nodemailer over Gmail (`lib/email.ts`) — invitations, sign-off and cost approval links, receipts |
| PDF | `@react-pdf/renderer` (server-side, uploaded to Supabase Storage) |
| Tests | Vitest (`tests/**`) |
| Config | `next.config.mjs` (ESM) — `output: 'standalone'` |

Path alias: `@/*` → project root.

---

## Four Areas

The hierarchy is **Platform Admin → Organization → Property → (floors, units, tenants)**. The organization
holds the license; only Platform Admin creates organizations and properties (D29).

| Area | URL | Who | Scope |
|---|---|---|---|
| Platform Admin ("Provider Dashboard" in code) | `/provider/*` | Provider (`app_metadata.role = 'provider'`) | All organizations and properties: licenses, termination, activity |
| Org portal | `/org/[orgSlug]/*` | Org Admin (`organization_members`, `owner` / `admin`) | One organization: its properties, Org Admins, profile (D30) |
| Admin Portal | `/[slug]/*` (route group `(admin)`) | Administrator, Property Manager, Head Engineer, Service Group | One property |
| Tenant Portal | `/[slug]/tenant/*` | Tenant (member of a tenant company) | Their company's floors and requests |

Who may do what is defined in
[`.github/skills/facilityppm-tenant-isolation/references/portal-role-matrix.md`](.github/skills/facilityppm-tenant-isolation/references/portal-role-matrix.md)
(the matrix + decision log D1–D33) and implemented in `lib/authz/` (custom property roles: catalog, templates,
`can()`, escalation) and `lib/org/roles.ts` (Org Admins). **Deny by default.** The UI says "Platform Admin"; routes and
`app_metadata.role` keep `provider`.

---

## Directory Structure

```
app/
  layout.tsx                      Root layout (no auth)
  login/                          Unified login for all property users
  reset-password/                 Password reset
  invite/[token]/                 Accept an invitation (public, token)
  sign-off/[token]/               Tenant sign-off from an emailed link (public, token)
  costing-approval/[token]/       Cost estimate approval from an emailed link (public, token)
  provider/                       Reserved static segment (takes routing priority over [slug])
    login/                        Platform Admin login
    (dashboard)/                  Platform Admin: organizations, properties, licenses, activity
  org/[orgSlug]/                  Org portal (reserved `org` segment)
    (portal)/                     requireOrgPage(): properties, members (Org Admins), settings
    suspended/                    Public notice for a suspended or expired organization
  [slug]/                         Dynamic property segment
    login/                        Redirects to /login
    suspended/                    Public suspended notice
    (admin)/                      Admin Portal (route group)
      layout.tsx                  requirePage(slug, 'portal.admin') + active-property sync
      page.tsx                    Dashboard overview
      work-orders/  fault-reports/  waived-orders/  floors/  engineers/
      assets/  schedules/  reports/  settings/
    tenant/                       Tenant Portal
      layout.tsx                  Tenant context; "not linked to a company" state (D19)
      service-requests/           Requests list, detail, in-portal approval/sign-off (/[id]/review)
      company/  settings/
      bills/  request-forms/  visitors/   Placeholders, hidden from the menu
  api/
    files/[bucket]/[...path]/     Authenticated file access (redirects to a 60 s signed URL)
    work-orders/[id]/*            Work order workflow actions (each guarded by lib/authz)
    service-requests/             Tenant submission + photo upload
    properties/[slug]/            Everything scoped to one property (authorizeForSlug, D31): floors, companies,
                                  occupancy, members (+ invite), assets, details (property profile),
                                  fault-reports (on behalf), work-orders (PPM), notifications, me (own profile),
                                  integrations/monday/*
    org/[orgSlug]/                Org portal API (authorizeOrg): profile, members, invitations
    provider/organizations/       Platform Admin: organizations, license, termination, Org Admins
    provider/properties/          Platform Admin: create property in an organization, members, invitations
    sign-off/[token]  costing-approval/[token]  invite/[token]   Public token endpoints (invite: property or org)
    pdf/[workOrderId]/            Receipt, costing, service report and audit PDFs (authenticated)
    engineers/active-check/       Login: rebuild access lists, answer the starting page
    switch-property/  auth/
components/
  ui/                             Modal (shared dialog: sizes sm/md/lg/xl, Esc, focus, scroll lock), ConfirmDialog
  layout/  dashboard/  work-orders/  tenant/  sign-off/  provider/  org/  settings/  pdf/
lib/
  authz/
    catalog.ts                    Permission keys (module, portals, scopes, implies, provider), normalizePermissions()
    templates.ts                  The 5 default roles (Administrator locked) and work types (None/Engineer/Service Group)
    permissions.ts                can(), scopeOf(), rolePermissions(), toClientActor() (client-safe)
    escalation.ts                 canAssignRole(), canManageMemberRole(), canEditRole(): strict-subset rule
    property-role.ts              parsePropertyRole(), PROPERTY_ROLE_COLUMNS, isAssignableRole() (client-safe)
    role-input.ts                 parseRoleInput() for the Roles API
    actor.ts                      resolveMembership() / resolveOrgMembership(): provider, active member, Org Admin
    guard.ts                      requireSession(), authorize(), authorizeForSlug(), authorizeOrg(), requireProvider(),
                                  requirePage(), requirePageRecord(), requireOrgPage(), requireProviderPage()
    records.ts                    WORK_ORDER_SCOPE_COLUMNS
  org/                            roles.ts (Org Admin rules, client-safe), members.ts (invites, changes, join),
                                  provisioning.ts (org-managed Administrator rows), accounts.ts (create, license,
                                  terminate), overview.ts, profile.ts
  properties/create.ts            createProperty(): property in an organization + Administrator provisioning
  access.ts                       Accessible properties/organizations from DB rows; resolveHome()
  auth-users.ts                   findAuthUserByEmail(), syncUserAccess() (rebuilds app_metadata access lists)
  reserved-slugs.ts               RESERVED_SLUGS, slugError(), slugify() (middleware + property/org creation)
  property-types.ts               commercial / corporate / residential
  supabase/
    client.ts                     Browser client factory (auth only)
    server.ts                     Server client factories (see below)
    middleware.ts                 Routing (not authorization)
  property-roles.ts               loadPropertyRoles(), loadRole(), loadAssignableMembers(), isEligibleAssignee(),
                                  countActiveAdministrators() (server)
  roles.ts                        Labels for stored role strings (formatRoleName)
  storage-urls.ts                 Stored file URLs ↔ /api/files URLs, file ownership by path (client-safe)
  storage-files.ts                Signed URLs and downloads with the service role (server-only)
  token.ts                        Link tokens: generateLinkToken(), hashToken(), isPlausibleToken()
  approvals.ts, approval-rules.ts Costing and sign-off decisions (shared by token links and the portal)
  verification-rules.ts           Final verification send-back rules (D28)
  work-order-workflow.ts          Status → workflow step mapping; buildWorkflowSteps() for the detail page timeline
  costing.ts                      Line items, formatPeso(), latestCosting()
  tenant.ts, tenant-submit.ts     Tenant Portal context and submission rules
  provider/                       Licenses, accounts, activity, audit labels, support view
  email.ts                        nodemailer utilities
  utils.ts                        cn() helper (clsx + tailwind-merge), formatPHT(), formatPHTDateTime() (12-hour)
types/
  index.ts                        Shared TypeScript interfaces
supabase/
  migrations/                     001–025, applied manually in order (see Migrations)
  tests/rls_check.sql             RLS verification script for the SQL Editor
tests/                            Vitest: authz matrix, approval rules, licenses, Org Admin rules, access lists,
                                  storage URLs, tokens
middleware.ts                     Next.js middleware (imports from lib/supabase/middleware.ts)
```

---

## Auth Architecture

### Identity

**`app_metadata`** (written only with the service role — users cannot change it):

```json
{
  "property_id": "<uuid>",               // Active property: only picks the starting page (D31)
  "property_slug": "<slug>",
  "property_ids": ["<uuid>", "..."],     // Properties with a member row of the user's own
  "property_slugs": ["<slug>", "..."],
  "org_ids": ["<uuid>"],                 // Organizations where the user is an active Org Admin (D30)
  "org_slugs": ["<slug>"],
  "terminated_property_ids": ["<uuid>"]  // Set when Platform Admin terminates an account (D23)
}
```

`syncUserAccess(service, userId)` (`lib/auth-users.ts`) rebuilds these lists from the database rows; it runs on
every sign-in (`/api/engineers/active-check`) and after membership changes. Org Admins reach their organization's
properties through `org_ids`, so the JWT does not grow with each property.

Provider users have `{ "role": "provider" }`. Property users have **no** `role` in `app_metadata` (older code
wrote `"superadmin"`; it is ignored and removed by `syncUserAccess()` / `grantPropertyAccess()`).

**The role inside a property** comes from the `engineers` row for `(user_id, property_id)`: `property_role_id →
property_roles` (D32) with its grants in `property_role_permissions`, plus `is_active` and `company_id` for
Tenant Portal roles. Every property has 5 default roles (Administrator, which is locked and holds every staff
permission; Property Manager; Head Engineer; Service Group; Tenant) and any custom roles its Administrators create.
A role has a portal (staff or tenant, fixed) and, for staff, a work type: None, Engineer or Service Group (D33).
The global `roles` table and `engineers.role_id` are legacy, kept in step by a sync trigger until migration 031.
`property_ids` (or `org_ids` for the property's organization) is necessary but not sufficient: without an active
`engineers` row with a current role, the user has no access to that property. Org Admins have org-managed
Administrator rows (`engineers.org_member_id`) in every property of their organization; property-level member
routes refuse to change them (D30). `user_metadata` is user-editable — never use it for authorization.

### Two Supabase Client Types — Critical Distinction

**`createClient()` — SSR/cookie-based client** (`lib/supabase/server.ts`):
- `createServerClient` from `@supabase/ssr` + anon key; session from cookies → user JWT → **RLS applies**
- Use for: `auth.getUser()` (inside `requireSession()` / `getCurrentUser()`) and the few own-row reads (Topbar)

**`createServiceClient()` — Service role client** (`lib/supabase/server.ts`):
- Raw `createClient` from `@supabase/supabase-js` + service role key,
  `{ auth: { autoRefreshToken: false, persistSession: false } }`
- **Bypasses ALL RLS** — every read and write after a `lib/authz` check, `auth.admin.*`, storage

> **Common mistake**: building the service client with `@supabase/ssr` `createServerClient` lets cookies leak
> in and causes RLS violations. Always use the raw `createClient` from `@supabase/supabase-js`.

**Browser client** (`lib/supabase/client.ts`): `createBrowserClient` + anon key, used in `'use client'`
components for **auth only** (login, sign-out, session refresh). The browser never reads or writes tables or
storage directly: RLS is read-only and there are no write privileges (migration 022), storage is private (023).

### Authorization Pattern (`lib/authz`)

Never compare role names in routes or pages. Every action is a permission key of `lib/authz/catalog.ts` (plus
`portal.admin` / `portal.tenant`, which come from the role's portal); `authorize()` / `requirePage*()` resolve the
membership and its property role for the **record's** property, check `is_active`, the license (suspended or
expired ⇒ blocked) and the grant's scope (`property`; `assigned` = work orders whose `engineer_id` is the member;
`company` = the tenant's company). Decide on role **attributes**, never names: `actor.portal` (tenant vs staff),
the work type (who can be assigned work: Service Group roles holding `workRequest.inspect` / `workRequest.execute`,
via `loadAssignableMembers()` / `isEligibleAssignee()`) and `actor.isAdministrator` (the locked role). List queries
apply `applyWorkOrderScope(query, actor)`.

**API route (work order):**

```typescript
import { authorize, requireSession } from '@/lib/authz/guard'
import { WORK_ORDER_SCOPE_COLUMNS } from '@/lib/authz/records'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // 1. Authenticate (server-validated getUser) and get a service client
  const session = await requireSession()
  if (!session.ok) return session.response
  const { service } = session

  // 2. Load the record with its scope columns
  const { data: wo } = await service.from('work_orders').select(`${WORK_ORDER_SCOPE_COLUMNS}, status`).eq('id', id).maybeSingle()
  if (!wo) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  // 3. Authorize against the RECORD (404 outside the caller's property, 403 for the wrong role)
  const access = await authorize(session, 'workRequest.execute', { record: wo })
  if (!access.ok) return access.response

  // 4. Validate input; never take property_id / role / company_id / floor_id from the body
  // 5. Write with the service client, constrained to the authorized record
  await service.from('work_orders').update({ /* allowed fields */ }).eq('id', wo.id)
}
```

**Other entry points:**

| Context | Call |
|---|---|
| Property route without a record | `authorizeForSlug(session, slug, action)` under `/api/properties/[slug]/…`; `authorize(session, action, { propertyId })` when the id is known. There is **no** active-property fallback (D31) |
| Platform Admin API | `requireProvider()` |
| Org portal API (`/api/org/[orgSlug]/…`) | `authorizeOrg(session, orgSlug, 'org.view' \| 'org.profile.edit' \| 'org.members.manage')` |
| Server page / layout | `requirePage(slug, action)`; for one record `requirePageRecord(slug, action, record)` (404 if out of scope) |
| Org portal page | `requireOrgPage(orgSlug, action?)` |
| Platform Admin page | `requireProviderPage()` |
| Tenant submission | `authorizeTenantSubmit(session, slug)` (`lib/tenant-submit.ts`; the slug is required) |
| Client component (show/hide only) | `can(actor, action, record?)` / `canOrg(actor, action)` — UX only, the server check is the control |

A new permission (module) goes into `lib/authz/catalog.ts`, a new migration's `permission_keys` upsert (the
Administrator role gets it automatically), the matrix file and `tests/authz/*` (the catalog test compares the code
with migration 026's seed). Providers are read-only inside a property (D2): set `provider: false` for any write
permission. Giving, editing and managing roles follows `lib/authz/escalation.ts` (strict subset; Administrators are
exempt), and the last active Administrator of a property cannot be demoted, deactivated or removed. Org Admin operations (invite, change, remove) live in `lib/org/members.ts` and are shared
by the Platform Admin and org portal routes, which authorize first.

---

## URL Structure & Routing

```
/login                         Unified login (property users and Org Admins); signed-in users are redirected
/org/[orgSlug]/*               Org portal (Org Admins)
/org/[orgSlug]/suspended       Public notice for a suspended or expired organization
/[slug]/*                      Admin Portal (staff; Platform Admin read-only support view)
/[slug]/tenant/*               Tenant Portal
/[slug]/login                  Redirects to /login
/[slug]/suspended              Public suspended notice
/provider/login                Public Platform Admin login
/provider/*                    Platform Admin (organizations, properties, activity)
/sign-off/[token]              Public tenant sign-off (emailed link)
/costing-approval/[token]      Public cost approval (emailed link)
/invite/[token]                Accept a property or Org Admin invitation
/reset-password                Password reset
```

**Reserved slugs** (cannot be property slugs) live in `lib/reserved-slugs.ts`, shared by the middleware and
property/organization creation: top-level routes (`provider`, `org`, `login`, `api`, `invite`, …), static files and
page names (`new`, `suspended`).

### Middleware (`lib/supabase/middleware.ts`) — routing only, not authorization

- Root `/` and a signed-in `/login` → `homePath()`: provider: `/provider/organizations`; Org Admin:
  `/org/<first org_slug>`; property user: active `property_slug` (or the first); unauthenticated: `/login`
- `/provider/*` → requires `app_metadata.role === 'provider'`
- `/org/[orgSlug]/*` → requires `org_slugs.includes(orgSlug)` (provider passes; the org layout redirects it)
- `/[slug]/*` → passes for the provider (read-only support view, D2), `property_slugs.includes(slug)`, or an Org
  Admin whose RLS-scoped read of the property succeeds
- Token pages, `/invite`, `/reset-password`, `/[slug]/suspended`, `/org/[orgSlug]/suspended` are public

Pages and routes enforce access themselves with `lib/authz`; never rely on the middleware for it.

### Admin Portal Layout (`app/[slug]/(admin)/layout.tsx`)

1. `requirePage(slug, 'portal.admin')`: tenants are redirected to `/[slug]/tenant`, users without an active
   membership are signed out, suspended/expired licenses (organization or property, the most restrictive wins)
   redirect to `/[slug]/suspended`
2. If `app_metadata.property_slug !== slug`, updates `property_id` / `property_slug` with
   `auth.admin.updateUserById()` (the starting page after the next sign-in; API routes take the slug from the URL)
3. Provider support views are audit-logged (at most once per 30 minutes, D24)
4. The Topbar loads the switcher list and unread notifications itself (`propertyId` prop)

---

## TypeScript Conventions

### Page vs Layout Params

```typescript
// ✅ Pages — params is a Promise in Next.js 14
interface Props { params: Promise<{ slug: string }> }
export default async function Page({ params }: Props) {
  const { slug } = await params  // MUST await
}

// ✅ Layouts — params is NOT a Promise (layout convention differs)
interface Props { params: { slug: string }; children: React.ReactNode }
export default async function Layout({ params, children }: Props) {
  const { slug } = params  // Direct access
}

// ✅ API dynamic routes — params IS a Promise
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params  // MUST await
}
```

### Server vs Client Components

- Default: Server Component (async, can use `cookies()`, `redirect()`, `notFound()`)
- Client: Add `'use client'` directive at top; use for forms, state, `useRouter`, `usePathname`
- Naming: client wrappers → `*Client.tsx`; forms → `*Form.tsx`
- `'use client'` files never import `@/lib/supabase/server`, `lib/storage-files.ts` or `lib/authz/guard.ts`
  (`lib/authz/permissions.ts` and `lib/storage-urls.ts` are client-safe)

### Common Patterns

```typescript
// Data flow: server page guards, fetches with the service client, passes plain data to a client component
export default async function Page({ params }: Props) {
  const { slug } = await params
  const { service, property, actor } = await requirePage(slug, 'floors.view')
  const { data } = await service.from('floors').select('...').eq('property_id', property.id)
  return <FloorsClient floors={withFileRouteUrls(data ?? [])} canManage={can(actor, 'floors.manage')} />
}

// cn() for conditional classes
import { cn } from '@/lib/utils'
<div className={cn('base-class', condition && 'conditional-class')} />
```

---

## Files & Storage

- Buckets are **private** (migration 023) with no storage policies; only the service role reads or writes them.
- The database stores each file's public-object URL (`<SUPABASE_URL>/storage/v1/object/public/<bucket>/<path>`)
  as an **identifier**. That URL does not work on its own — convert it before it reaches a browser:

| Where | Use |
|---|---|
| Signed-in pages | `withFileRouteUrls(data)` / `fileRouteUrl(url)` → `/api/files/<bucket>/<path>` (checks `workRequest.view`, redirects to a 60 s signed URL) |
| PDFs that link files (audit report) | `fileRouteUrl(url, { absolute: true })` |
| Public token pages (sign-off) | `await withSignedFileUrls(service, data)` → 1 h signed URLs |
| Server code (PDF photos, Monday sync) | `downloadStoredFile(service, url)` |

- Upload paths (`fileOwnerFromPath()` maps them to the owning work order):
  `<property>/<work order>/<file>` (work order files), `service-reports/<property>/<member>/<file>` (tenant photos),
  `receipts/<WO number>-<work order>.pdf`, `audit-reports/<WO number>-<work order>.pdf`.
  **A new path shape must be added to `fileOwnerFromPath()`** or `/api/files` answers 404.
- Upload routes return file-route URLs; URLs coming back from the browser are converted to the stored form and
  prefix-checked by `sanitizeWorkOrderFileUrls()` / `sanitizeServiceReportPhotoUrls()`.

---

## Public Token Links (sign-off, cost approval, invitation)

- Create: `const token = generateLinkToken()`; store **only** `hashToken(token)` in `work_orders.sign_off_token_hash`,
  `work_orders.costing_token_hash`, `invitations.token_hash` or `organization_invitations.token_hash`; the raw token
  goes only into the email. `/invite/[token]` looks the hash up in `invitations`, then `organization_invitations`.
- Look up: `if (!isPlausibleToken(token)) → 404`, then `.eq('<column>_hash', hashToken(token))`.
- The raw columns (`sign_off_token`, `costing_token`, `invitations.token`) stay null — CHECK constraints from
  migration 024 reject any write to them.
- Never return a token or its hash to the browser (pages strip `*_token_hash` before passing data to clients).
- Decisions are single-use conditional updates that require the work order to still be waiting (D22) — reuse
  `lib/approvals.ts`, which the token routes and the in-portal routes share.

---

## RLS (defense in depth)

The app reads and writes data only on the server with the service role after `lib/authz` checks. RLS covers
the Data API, where a signed-in user's JWT reaches the database directly (migration 022, D25):

- `anon`: no table access. `authenticated`: **SELECT only**, no write policies or privileges.
- Policies are driven by role **permissions** (migration 027, D32) through `security definer` helpers in the
  non-exposed `private` schema: `my_member_roles()` (active member with a property role, usable property **and**
  organization license, property in `app_metadata.property_ids` or its organization in `org_ids`), `my_grants()`
  (the Administrator role: every staff key), `scope_property_ids(key)`, `scope_assigned(key)`, `scope_company_ids(key)`,
  `my_company_ids()`, `member_property_ids()`, `my_engineer_ids()`, `is_provider()`, `my_org_ids()`. The 022
  helpers (`staff_property_ids`, …) remain as permission-based wrappers until 030.

```sql
create policy "Role-scoped read work_orders" on work_orders
  for select to authenticated
  using (
    (select private.is_provider())
    or property_id in (select private.scope_property_ids('workRequest.view'))             -- property scope
    or (property_id, engineer_id) in (select a.property_id, a.engineer_id
                                      from private.scope_assigned('workRequest.view') a)  -- assigned work
    or company_id in (select private.scope_company_ids('workRequest.view'))               -- own company
  );
```

- Work order detail tables (`work_order_reports`, `_costings`, `_completion_evidence`, `_comments`, `_events`,
  `checklist_items`, `approval_trail`, `service_ratings`) are readable exactly when the work order is.
- `invitations`, `organization_invitations` and `property_monday_integrations` have no policies (service role
  only). Org Admins read their `organizations` row and its `organization_members`.
- **New table**: enable RLS and add a role-aware SELECT policy with the helpers in the same migration; no
  INSERT/UPDATE/DELETE policies.
- Verify with `supabase/tests/rls_check.sql` in the SQL Editor (empty result = pass).

---

## Database Schema (Key Tables)

```
organizations     id, slug (unique), name, legal_name, contact_*, address, city, country, website,
                  license_status ('active'|'trial'|'suspended'), license_expires_at   (the license, D29)
organization_members      id, organization_id, user_id, email, full_name, org_role ('owner'|'admin'), is_active
organization_invitations  id, organization_id, email, org_role, token_hash, expires_at, used_at
properties        id, slug (unique), name, organization_id→organizations, property_type
                  ('commercial'|'corporate'|'residential'), license_status, license_expires_at (mirror of the org's)
sites             id, property_id→properties, name, address
buildings         id, site_id→sites, name, floors
assets            id, building_id→buildings, name, category, make, model, serial_no, status
ppm_schedules     id, asset_id→assets, title, frequency, interval_days, next_due, priority
floors            id, property_id, building_id (nullable), label (unique per property), level, sort_order
tenant_companies  id, property_id, name, contact_email, contact_phone, is_active
floor_occupancies id, property_id, floor_id, company_id, starts_on, ends_on (one open row per floor)
permission_keys   key, module, label, portals[], scopes[]   (catalog mirror of lib/authz/catalog.ts)
property_roles    id, property_id, name, description, portal ('staff'|'tenant'), work_type ('none'|'engineer'|
                  'service_group'), system_key (5 defaults), is_locked (Administrator), updated_at
property_role_permissions  role_id, property_id, permission_key, scope ('property'|'assigned'|'company')
engineers         id, property_id, user_id (nullable), email, full_name, property_role_id→property_roles, is_active,
                  company_id (tenants only), org_member_id + org_restore (org-managed Administrator rows, D30)
roles             id, name (legacy global role names; engineers.role_id follows property_role_id via trigger)
invitations       id, property_id, email, property_role_id, role_name (legacy), company_id, token_hash, expires_at, used_at
work_orders       id, property_id, company_id, floor_id, engineer_id, requested_by_id, wo_number (unique),
                  type, status, priority, tenant_email, tenant_name,
                  sign_off_token_hash, sign_off_expires_at, signed_at, costing_token_hash,
                  costing_token_expires_at, pdf_url, audit_report_url
work_order_reports / work_order_costings / work_order_completion_evidence / work_order_comments /
work_order_events / approval_trail / service_ratings / checklist_items   → work_order_id
inventory_items   id, property_id, name, quantity
parts_used        id, work_order_id, inventory_item_id
notifications     id, engineer_id, read
audit_log         id, property_id, organization_id, action, entity_type, entity_id, metadata (actor_role)
```

**Engineers email uniqueness**: NOT globally unique. Same email can appear across properties. Unique only per
`(user_id, property_id)` where `user_id IS NOT NULL` (partial index).

`work_orders.company_id` / `floor_id` are set server-side from the submitter's company and its occupied
floors — never from the request body. Composite foreign keys `(id, property_id)` prevent pointing at another
property's floor or company.

### Migrations

Numbered files in `supabase/migrations/`, applied **manually in the Supabase SQL Editor, in order, staging
first**. There is no migration runner. Each new migration must be safe to re-run. Never edit an applied
migration — add a new numbered file.

Rewrite migrations and their deploy constraints:

| Migration | Content | Deploy note |
|---|---|---|
| `019_security_hotfix.sql` | Removes permissive write/token-presence/invitation policies | — |
| `020_service_group_role.sql` | `'service group'` → `service_group` | Before or after the code |
| `021_floors_companies.sql` | Floors, companies, occupancy, `license_expires_at`; deactivates `viewer` members | **Before** Phase 2+ code |
| `022_role_aware_rls.sql` | Read-only role-aware RLS, `private` helpers, revokes Data API writes | — |
| `023_private_storage.sql` | Private buckets, size/MIME limits | With the app version that has `/api/files` |
| `024_hashed_tokens.sql` | Token hashes, raw tokens hashed in place, CHECK constraints | App **immediately after** (older code writes raw tokens) |
| `025_organizations.sql` | Organizations, Org Admins and their invitations, `properties.organization_id` / `property_type`, org-managed Administrator rows; backfill (one organization per property); TEMPORARY trigger that gives old-app property inserts an organization; `my_memberships()` also checks the organization license and accepts `org_ids` | **Before** the Phase A app (it selects the new columns). Then run `rls_check.sql` (must be empty). Never re-run 022 after 029 |

| `026_property_roles.sql` | Permission catalog, per-property roles with portal and work type, grants, the 5 default roles seeded per property (and by a permanent trigger for new properties), members and invitations mapped to property roles, sync triggers between `role_id`/`role_name` and `property_role_id` | **Before** the custom-roles app |
| `027_permission_rls.sql` | RLS on permission keys instead of role names (`my_grants()`, `scope_*()`), read policies for the role tables | Right after 026, then `rls_check.sql` (must be empty) |

The organization rebuild continues with 028 (units), 029 (assets on property), 030 (cleanup: drops the temporary
triggers and the 022 helpers) and 031 (destructive legacy drop: global `roles`, `engineers.role_id`, sites,
buildings); see the rebuild plan. Each phase ships its own app version.

---

## Key Pitfalls & Bug History

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| RLS violation on INSERT even with service role | `createServiceClient` used `createServerClient` from `@supabase/ssr`, so cookies leaked into the service client | Use raw `createClient` from `@supabase/supabase-js` for service role |
| Suspended page redirect loop | `/login` redirected to `/suspended` → had "Back to login" link → loop | Login page shows suspended state inline; no redirect |
| Cross-property navigation blocked | Layout fetched the property via the user-scoped client → RLS mismatch | Guards use the service client; the admin layout syncs the active property |
| Login isolation failure | Middleware only checked `property_slug ===` (singular), not array | `property_slugs.includes(slug)`; access also needs an active `engineers` row |
| `params.slug` type error | Next.js 14 pages wrap params in Promise | Always `await params` in page components and API dynamic routes |
| PDF not available immediately | PDF generation is fire-and-forget after sign-off | Expected — `/api/pdf/[workOrderId]` regenerates on demand |
| Broken images / 404 on file links | Buckets are private; stored URLs are identifiers | Pass data through `withFileRouteUrls()` (signed-in) or `withSignedFileUrls()` (token pages) |
| `.contains()` on a `jsonb` column never matches | supabase-js sends a JS array as a Postgres array literal (`cs.{…}`), invalid JSON | Pass a JSON string: `.contains('photo_urls', JSON.stringify([url]))` |
| Insert/update fails with `work_orders_no_raw_*` / `invitations_no_raw_token` | Code wrote a raw token column | Write `*_token_hash` with `hashToken()` |
| Tenant sees "not linked to a company" | Tenant users are not auto-linked (D19) | An Admin/PM links them on the Floors & Tenants page |
| Old cost estimate shown after a revision | `work_order_costings` has no unique `work_order_id`; each revision inserts a row and embeds come back unordered | Pick the estimate with `latestCosting()`, never `[0]` |
| Work order status changed twice by concurrent clicks | Unconditional `.update().eq('id', id)` | Guard workflow updates with `.eq('status', expected).select('id')` and return 409 when no row changed |
| A write lands in the wrong property with two tabs open | Routes acted on `app_metadata.property_id`, which the last opened tab sets | Property routes live under `/api/properties/[slug]/…` and use `authorizeForSlug` (D31) |
| The Org Admin (or any office role) shows up in "Assigned to" | Pickers listed every active member | Assignment lists and routes accept only Service Group roles holding inspect/execute (`loadAssignableMembers`, `isEligibleAssignee`, D33) |
| A custom role name shows a default label (e.g. "Engineer" → "Head Engineer") | Labels mapped names through the old aliases | `formatRoleName()` only maps lowercase machine keys; typed names show as typed |
| An Org Admin's Administrator row was edited from the property and then "restored" wrongly | Org-managed rows changed outside the organization | Property member routes answer 409 for rows with `org_member_id`; change Org Admins on the organization |

---

## Multi-Property Support

One user can be a member of several properties, with a different role in each, and an Org Admin of
organizations:
- `property_ids[]` / `property_slugs[]` list properties with a member row of the user's own; `org_ids[]` /
  `org_slugs[]` list the organizations they administer. `syncUserAccess()` rebuilds them from the rows.
- `property_id` / `property_slug` = the active property (auto-updated on Admin Portal navigation); it only picks
  the starting page (D31)
- Always resolve the role **for the property being acted on** (`authorize()` uses the record's property)
- The Topbar switcher lists properties with an active member row (`loadAccessibleProperties()`) and links to the
  user's organizations
- Switching calls `POST /api/switch-property` (checks the membership) → `supabase.auth.refreshSession()` → navigate

Adding an existing user to a new property (same email already registered):
- `findAuthUserByEmail()`, insert the `engineers` row, then `syncUserAccess()` (older Platform Admin routes still
  merge with `grantPropertyAccess()`; never overwrite `property_ids` by hand)

Org Admins (D30): accepting an organization invitation (`/invite/[token]`), adding a property to the organization
(`createProperty()`) or reactivating an Org Admin provisions an org-managed Administrator row in every property
(`lib/org/provisioning.ts`); deactivating or removing the Org Admin restores the user's own row or deletes the
org-created one. An organization keeps at least one active owner.

Terminating an organization (D23, D29) suspends its license and terminates each property: deactivates the
property's members and bans only users without another active membership; reactivation restores exactly those
members.

---

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL          Supabase project URL (also the prefix of stored file URLs)
NEXT_PUBLIC_SUPABASE_ANON_KEY     Public anon key (safe to expose)
SUPABASE_SERVICE_ROLE_KEY         Service role key (NEVER expose to client)
NEXT_PUBLIC_APP_URL               Canonical URL (email links, absolute file-route links in PDFs)
GMAIL_USER, GMAIL_APP_PASSWORD    Outgoing email (nodemailer)
MONDAY_CREDENTIAL_ENCRYPTION_KEY  Encrypts stored Monday.com API keys
MONDAY_API_VERSION                Optional Monday.com API version override
```

All stored in `.env.local` (not committed).

---

## Agent Skills

On-demand skills live in `.github/skills/<name>/` (committed; `.gitignore` re-includes `.github/skills/**/*.md`).
Agents load a skill when its `description` matches the task, or explicitly via `/<skill-name>`.

| Skill | Use for | Source (pinned) | License |
|-------|---------|-----------------|---------|
| `facilityppm-tenant-isolation` | **Project-specific.** Provider/Admin/Tenant role matrix, Supabase authz + RLS rules, audit script | this repo | — |
| `security-best-practices` | Next.js / React / TS secure-by-default review & report (explicit request) | `openai/skills@49f948f` `skills/.curated/security-best-practices` | see `LICENSE.txt` |
| `security-threat-model` | Repo-grounded threat model: trust boundaries, abuse paths (explicit request) | `openai/skills@49f948f` `skills/.curated/security-threat-model` | see `LICENSE.txt` |
| `supabase` | Supabase Auth, SSR, RLS, Storage, CLI; security checklist | `supabase/agent-skills@c9be0e9` `skills/supabase` | MIT |
| `supabase-postgres-best-practices` | Schema, migrations, RLS policies, indexes, query performance | `supabase/agent-skills@c9be0e9` `skills/supabase-postgres-best-practices` | MIT |
| `differential-review` | Security review of a PR / commit / diff with blast radius | `trailofbits/skills@711af09` `plugins/differential-review/skills/differential-review` | CC-BY-SA-4.0 |
| `sharp-edges` | Footgun APIs, dangerous defaults, misuse-prone auth/config design | `trailofbits/skills@711af09` `plugins/sharp-edges/skills/sharp-edges` | CC-BY-SA-4.0 |
| `supply-chain-risk-auditor` | npm dependency advisories, abandoned packages, install scripts | `trailofbits/skills@711af09` `plugins/supply-chain-risk-auditor/skills/supply-chain-risk-auditor` | CC-BY-SA-4.0 |
| `vercel-react-best-practices` | React / Next.js performance patterns (not security) | `vercel-labs/agent-skills@1a2c79d` `skills/react-best-practices` | MIT |

Full commit SHAs: openai `49f948faa9258a0c61caceaf225e179651397431`, supabase `c9be0e931b7930f7d02126d04774d904c381e7d7`,
trailofbits `711af095215ad4ecde5b90cd1d0124b3f1c4ca9e`, vercel-labs `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62`.

**Tenant-isolation audit** (report-only, needs `pnpm install` for `typescript`):

```bash
pnpm audit:tenant                                                                             # --strict: exit 1 on HIGH
node .github/skills/facilityppm-tenant-isolation/scripts/audit-tenant-isolation.mjs          # Markdown report
node .github/skills/facilityppm-tenant-isolation/scripts/audit-tenant-isolation.mjs --strict # exit 1 on HIGH
```

**Notes on third-party skills**
- Vendored as-is except: `vercel-react-best-practices` omits the generated 112 KB `AGENTS.md` (would be picked up as
  nested agent instructions; all rules remain in `rules/`) and its `SKILL.md` "Full Compiled Document" line was edited.
- `supply-chain-risk-auditor` needs Python + [`uv`](https://docs.astral.sh/uv/), calls public registry/advisory APIs
  (OSV, npm, deps.dev, GitHub, Scorecard) and reads the `gh` token if present. It does **not** parse `pnpm-lock.yaml`,
  so only direct dependencies from `package.json` are version-matched.
- `supabase` skill: its feedback flow can file a **public** GitHub issue on `supabase/agent-skills` (after asking) —
  never include project code, schema, or data in it. Don't let it create `.mcp.json` without review.
- Trail of Bits frontmatter (`allowed-tools`) and `agents/openai.yaml` files are tool-specific metadata; Copilot ignores them.
- **Updating**: re-vendor from a new commit SHA, review the diff for prompt-injection / unexpected commands, update
  this table. Never pull skills from unpinned branches.
