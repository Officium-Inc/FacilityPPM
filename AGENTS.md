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

## Three Portals

| Portal | URL | Who | Scope |
|---|---|---|---|
| Provider Dashboard | `/provider/*` | Provider (`app_metadata.role = 'provider'`) | All properties: accounts, licenses, activity |
| Admin Portal | `/[slug]/*` (route group `(admin)`) | Administrator, Property Manager, Head Engineer, Service Group | One property |
| Tenant Portal | `/[slug]/tenant/*` | Tenant (member of a tenant company) | Their company's floors and requests |

Who may do what is defined in
[`.github/skills/facilityppm-tenant-isolation/references/portal-role-matrix.md`](.github/skills/facilityppm-tenant-isolation/references/portal-role-matrix.md)
(the matrix + decision log D1–D28) and implemented in `lib/authz/permissions.ts`. **Deny by default.**

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
    login/                        Provider login
    (dashboard)/                  Provider Dashboard: properties, accounts, licenses, activity
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
    fault-reports/                Staff submission on behalf of a company
    properties/[slug]/            Floors, companies, occupancy, company members (Admin Portal)
    provider/properties/          Provider Dashboard CRUD (accounts, licenses, members, invitations)
    sign-off/[token]  costing-approval/[token]  invite/[token]   Public token endpoints
    pdf/[workOrderId]/            Receipt, costing, service report and audit PDFs (authenticated)
    engineers/  assets/  notifications/  profile/  switch-property/  integrations/  auth/
components/
  layout/  dashboard/  work-orders/  tenant/  sign-off/  provider/  settings/  pdf/
lib/
  authz/
    permissions.ts                The permission matrix: PERMISSIONS, can(), assignableRoles(), canManageMember()
    actor.ts                      resolveMembership() / resolveActor(): provider or active member + canonical role
    guard.ts                      requireSession(), authorize(), authorizeForSlug(), requireProvider(),
                                  requirePage(), requirePageRecord(), requireProviderPage()
    records.ts                    WORK_ORDER_SCOPE_COLUMNS
  supabase/
    client.ts                     Browser client factory (auth only)
    server.ts                     Server client factories (see below)
    middleware.ts                 Routing (not authorization)
  roles.ts                        Canonical role names + normalizeRoleName()
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
  migrations/                     001–024, applied manually in order (see Migrations)
  tests/rls_check.sql             RLS verification script for the SQL Editor
tests/                            Vitest: authz matrix, approval rules, licenses, storage URLs, tokens
middleware.ts                     Next.js middleware (imports from lib/supabase/middleware.ts)
```

---

## Auth Architecture

### Identity

**`app_metadata`** (written only with the service role — users cannot change it):

```json
{
  "property_id": "<uuid>",               // Active property (synced to the URL by the Admin Portal layout)
  "property_slug": "<slug>",
  "property_ids": ["<uuid>", "..."],     // Every property the user may enter
  "property_slugs": ["<slug>", "..."],
  "terminated_property_ids": ["<uuid>"]  // Set when the provider terminates an account (D23)
}
```

Provider users have `{ "role": "provider" }`. Property users have **no** `role` in `app_metadata` (older code
wrote `"superadmin"`; it is ignored and removed by `grantPropertyAccess()`).

**The role inside a property** comes from the `engineers` row for `(user_id, property_id)`: `role_id → roles.name`
(normalized by `normalizeRoleName()`), `is_active`, and `company_id` for tenants. Canonical roles: `admin`,
`property_manager`, `head_engineer`, `service_group`, `tenant`; `viewer` is retired (D1).
`property_ids` is necessary but not sufficient: without an active `engineers` row with a current role, the user
has no access to that property. `user_metadata` is user-editable — never use it for authorization.

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

Never compare role strings in routes or pages. Every action is a key of `PERMISSIONS` in
`lib/authz/permissions.ts`; `authorize()` / `requirePage*()` resolve the membership for the **record's**
property, check `is_active`, the license (suspended or expired ⇒ blocked) and the role's scope
(`property`, `assigned` for Service Group, `company` for tenants).

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
| Route without a record (active property) | `authorize(session, action)` or `authorize(session, action, { propertyId })` |
| Slug-scoped API (`/api/properties/[slug]/…`) | `authorizeForSlug(session, slug, action)` |
| Provider Dashboard API | `requireProvider()` |
| Server page / layout | `requirePage(slug, action)`; for one record `requirePageRecord(slug, action, record)` (404 if out of scope) |
| Provider Dashboard page | `requireProviderPage()` |
| Tenant submission | `authorizeTenantSubmit(session, slug)` (`lib/tenant-submit.ts`) |
| Client component (show/hide only) | `can(actor, action, record?)` — UX only, the server check is the control |

New actions go into `lib/authz/permissions.ts`, the matrix file and `tests/authz/permissions.test.ts`.
Providers are read-only inside a property (D2): set `provider: false` for any write action outside the
Provider Dashboard.

---

## URL Structure & Routing

```
/login                         Unified login (property users); signed-in users are redirected
/[slug]/*                      Admin Portal (staff; provider read-only support view)
/[slug]/tenant/*               Tenant Portal
/[slug]/login                  Redirects to /login
/[slug]/suspended              Public suspended notice
/provider/login                Public provider login
/provider/*                    Provider Dashboard
/sign-off/[token]              Public tenant sign-off (emailed link)
/costing-approval/[token]      Public cost approval (emailed link)
/invite/[token]                Accept invitation
/reset-password                Password reset
```

**Reserved slugs** (cannot be property slugs): `provider`, `sign-off`, `api`, `_next`, `admin`, `static`, `login`,
`invite`, `reset-password`, `costing-approval`, `fault-reports`

### Middleware (`lib/supabase/middleware.ts`) — routing only, not authorization

- Root `/` → provider: `/provider/properties`; property user: active `property_slug`; unauthenticated: `/login`
- `/provider/*` → requires `app_metadata.role === 'provider'`
- `/[slug]/*` → requires a user with `property_slugs.includes(slug)` (array check, not equality)
- Token pages, `/invite`, `/reset-password`, `/[slug]/suspended` are public

Pages and routes enforce access themselves with `lib/authz`; never rely on the middleware for it.

### Admin Portal Layout (`app/[slug]/(admin)/layout.tsx`)

1. `requirePage(slug, 'portal.admin')`: tenants are redirected to `/[slug]/tenant`, users without an active
   membership are signed out, suspended/expired licenses redirect to `/[slug]/suspended`
2. If `app_metadata.property_slug !== slug`, updates `property_id` / `property_slug` with
   `auth.admin.updateUserById()` so API routes act on the property being viewed
3. Provider support views are audit-logged (at most once per 30 minutes, D24)
4. Loads the user's properties (`property_ids[]`) for the Topbar switcher

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
  `work_orders.costing_token_hash` or `invitations.token_hash`; the raw token goes only into the email.
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
- Policies mirror the matrix through `security definer` helpers in the non-exposed `private` schema:
  `private.is_provider()`, `private.my_memberships()` (active member, current role, usable license,
  property in `app_metadata.property_ids`), `staff_property_ids()`, `manager_property_ids()`,
  `member_property_ids()`, `assigned_work()`, `tenant_company_ids()`, `my_engineer_ids()`.

```sql
create policy "Role-scoped read work_orders" on work_orders
  for select to authenticated
  using (
    (select private.is_provider())
    or property_id in (select private.staff_property_ids())                       -- staff: property
    or (property_id, engineer_id) in (select aw.property_id, aw.engineer_id
                                      from private.assigned_work() aw)            -- Service Group: assigned
    or company_id in (select private.tenant_company_ids())                        -- tenants: own company
  );
```

- Work order detail tables (`work_order_reports`, `_costings`, `_completion_evidence`, `_comments`, `_events`,
  `checklist_items`, `approval_trail`, `service_ratings`) are readable exactly when the work order is.
- `invitations` and `property_monday_integrations` have no policies (service role only).
- **New table**: enable RLS and add a role-aware SELECT policy with the helpers in the same migration; no
  INSERT/UPDATE/DELETE policies.
- Verify with `supabase/tests/rls_check.sql` in the SQL Editor (empty result = pass).

---

## Database Schema (Key Tables)

```
properties        id, slug (unique), name, license_status ('active'|'trial'|'suspended'), license_expires_at
sites             id, property_id→properties, name, address
buildings         id, site_id→sites, name, floors
assets            id, building_id→buildings, name, category, make, model, serial_no, status
ppm_schedules     id, asset_id→assets, title, frequency, interval_days, next_due, priority
floors            id, property_id, building_id (nullable), label (unique per property), level, sort_order
tenant_companies  id, property_id, name, contact_email, contact_phone, is_active
floor_occupancies id, property_id, floor_id, company_id, starts_on, ends_on (one open row per floor)
engineers         id, property_id, user_id (nullable), email, full_name, role_id→roles, is_active,
                  company_id (tenants only)
roles             id, property_id, name (canonical snake_case names)
invitations       id, property_id, email, role_name, company_id, token_hash, expires_at, used_at
work_orders       id, property_id, company_id, floor_id, engineer_id, requested_by_id, wo_number (unique),
                  type, status, priority, tenant_email, tenant_name,
                  sign_off_token_hash, sign_off_expires_at, signed_at, costing_token_hash,
                  costing_token_expires_at, pdf_url, audit_report_url
work_order_reports / work_order_costings / work_order_completion_evidence / work_order_comments /
work_order_events / approval_trail / service_ratings / checklist_items   → work_order_id
inventory_items   id, property_id, name, quantity
parts_used        id, work_order_id, inventory_item_id
notifications     id, engineer_id, read
audit_log         id, property_id, action, table_name, record_id, metadata (provider actions: actor_role)
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

---

## Multi-Property Support

One user can be a member of several properties, with a different role in each:
- `property_ids[]` and `property_slugs[]` in `app_metadata` contain all accessible entries
- `property_id` / `property_slug` = currently active (auto-updated on Admin Portal navigation)
- Always resolve the role **for the property being acted on** (`authorize()` uses the record's property)
- Topbar shows a `⇄` switcher dropdown if the user has 2+ properties
- Switching calls `POST /api/switch-property` → updates `app_metadata` → `supabase.auth.refreshSession()` → navigate

Adding an existing user to a new property (same email already registered):
- `findAuthUserByEmail()` + `grantPropertyAccess()` (`lib/auth-users.ts`) merge the property into the arrays
  (never overwrite `property_ids`)
- Insert a new `engineers` row for that property

Terminating an account (D23) suspends the license, deactivates the property's members and bans only users
without another active membership; reactivation restores exactly those members.

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
