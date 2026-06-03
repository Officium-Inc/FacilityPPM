# FacilityPPM — Agent Customization Guide

This file contains essential codebase knowledge for AI coding agents working in this repository.

---

## Build & Dev Commands

```bash
pnpm dev          # Start dev server on localhost:3000
pnpm build        # Production build (output: standalone)
pnpm start        # Start production server
pnpm lint         # Run ESLint
pnpm exec tsc --noEmit  # Type-check without emitting (preferred over build for validation)
```

**PATH note (Windows)**: `C:\Users\Officium\AppData\Roaming\npm` must be in PATH for pnpm to resolve.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14.2.x — App Router, TypeScript strict |
| Language | TypeScript 5 (`tsconfig.json` strict mode) |
| Styling | Tailwind CSS 3.4.x + PostCSS (ESM: `postcss.config.mjs`) |
| Database | Supabase (PostgreSQL) with Row Level Security |
| Auth | `@supabase/ssr` + `@supabase/supabase-js` |
| Email | Resend (sign-off notifications) |
| PDF | `@react-pdf/renderer` (server-side, uploaded to Supabase Storage) |
| Config | `next.config.mjs` (ESM) — `output: 'standalone'` |

Path alias: `@/*` → project root.

---

## Directory Structure

```
app/
  layout.tsx                      Root layout (no auth)
  globals.css                     Tailwind imports
  api/
    work-orders/route.ts          POST create work order
    engineers/route.ts            POST create / PATCH update engineer
    assets/route.ts               POST create asset
    switch-property/route.ts      POST switch active property
    sign-off/[token]/route.ts     POST approve/reject (token-validated, public)
    pdf/[workOrderId]/route.ts    GET generate + upload PDF
    provider/properties/          Provider admin CRUD
  [slug]/                         Dynamic property segment
    login/                        Public login page
    suspended/                    Public suspended notice
    (dashboard)/                  Protected dashboard (route group)
      layout.tsx                  Auth shell + auto-switch active property
      page.tsx                    Dashboard overview
      work-orders/
      assets/
      engineers/
      schedules/
      reports/
  provider/                       Reserved static segment (takes routing priority over [slug])
    login/                        Public provider login
    (dashboard)/
      properties/                 Manage all properties
  sign-off/[token]/               Public sign-off flow (no auth)
components/
  dashboard/                      KPI cards, charts, summary tables
  work-orders/                    Status badges, checklist, action buttons
  layout/                         Sidebar, Topbar, TopbarClient
  sign-off/                       SignOffPage, SignaturePad, RejectPanel
  pdf/                            AcknowledgementReceipt (PDF component)
  provider/                       Provider-specific UI
lib/
  supabase/
    client.ts                     Browser client factory
    server.ts                     Server client factories (see below)
    middleware.ts                  Auth + routing logic
  email.ts                        Resend utilities
  token.ts                        Sign-off token generation + record hashing
  utils.ts                        cn() helper (clsx + tailwind-merge)
types/
  index.ts                        Shared TypeScript interfaces
supabase/
  migrations/
    001_initial_schema.sql        Full DB schema, RLS policies, seed data
middleware.ts                     Next.js middleware (imports from lib/supabase/middleware.ts)
```

---

## Auth Architecture

### `app_metadata` Structure (set by service role — cannot be forged by users)

**Property user:**
```json
{
  "role": "superadmin",
  "property_id": "<uuid>",            // Currently active property
  "property_slug": "<slug>",           // Active property slug
  "property_ids": ["<uuid>", "..."],   // All accessible properties
  "property_slugs": ["<slug>", "..."]  // All accessible slugs
}
```

**Provider user (Marajo admin):**
```json
{
  "role": "provider"
}
```

### Two Supabase Client Types — Critical Distinction

**`createClient()` — SSR/cookie-based client** (`lib/supabase/server.ts`):
- Uses `createServerClient` from `@supabase/ssr` + anon key
- Session from cookies → user JWT → **RLS policies apply**
- Use for: reading the current user, operations that should be scoped by RLS

**`createServiceClient()` — Service role client** (`lib/supabase/server.ts`):
- Uses raw `createClient` from `@supabase/supabase-js` + service role key
- `{ auth: { autoRefreshToken: false, persistSession: false } }`
- **Bypasses ALL RLS** — use with caution
- Use for: updating `app_metadata`, admin writes, fetching cross-property data after app-layer validation

> **Common mistake**: Using `createServiceClient` with `@supabase/ssr` `createServerClient` will still be influenced by cookies and cause RLS violations. Always import the raw `createClient` from `@supabase/supabase-js` for the service client.

**Browser client** (`lib/supabase/client.ts`):
- Uses `createBrowserClient` from `@supabase/ssr` + anon key
- Used in `'use client'` components only

### Standard API Route Auth Pattern

```typescript
// 1. Validate user (SSR client, respects RLS)
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

// 2. Extract property scope from app_metadata
const propertyId = user.app_metadata?.property_id as string | undefined
if (!propertyId) return NextResponse.json({ error: 'No active property' }, { status: 400 })

// 3. Use service client for privileged writes
const service = await createServiceClient()
const { data, error } = await service.from('work_orders').insert({
  property_id: propertyId,  // Always attach; RLS validates on read
  ...body
})
```

---

## URL Structure & Routing

```
/[slug]/login          Public property login
/[slug]/suspended      Public suspended notice
/[slug]/(dashboard)/*  Protected property dashboard
/provider/login        Public provider login
/provider/*            Protected provider portal
/sign-off/[token]      Public work order sign-off
```

**Reserved slugs** (cannot be used as property slugs): `provider`, `sign-off`, `api`, `_next`, `admin`, `static`, `login`

### Middleware Routing Logic (`lib/supabase/middleware.ts`)

- Root `/` → provider: `/provider/properties`; property user: active `property_slug`; unauthenticated: `/provider/login`
- `/provider/*` → requires `app_metadata.role === 'provider'`
- `/[slug]/login` + `/[slug]/suspended` → public (no auth required)
- `/[slug]/(dashboard)/*` → requires user + `property_slugs.includes(slug)` (array check, not equality)

### Dashboard Layout Auto-Switch (`app/[slug]/(dashboard)/layout.tsx`)

On every navigation to a dashboard route, the layout:
1. Fetches property via **service client** (bypasses RLS — needed because active `property_id` may differ)
2. If `user.app_metadata.property_slug !== slug` → calls `auth.admin.updateUserById()` to update `property_id` + `property_slug`
3. If `license_status === 'suspended'` → redirects to `/{slug}/suspended`
4. Fetches all user properties (`property_ids[]`) for the Topbar switcher

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

### Common Patterns

```typescript
// Data flow: Server page fetches, passes to client component
export default async function Page({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('...').select('...')
  return <XyzClient data={data} slug={slug} />
}

// cn() for conditional classes
import { cn } from '@/lib/utils'
<div className={cn('base-class', condition && 'conditional-class')} />
```

---

## RLS Policy Patterns

All property-scoped tables check:
```sql
(auth.jwt() -> 'app_metadata' ->> 'property_id')::uuid = property_id
```

Provider bypass:
```sql
OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'provider'
```

Work orders also allow public sign-off token access:
```sql
OR sign_off_token IS NOT NULL
```

---

## Database Schema (Key Tables)

```
properties        id, slug (unique), name, license_status ('active'|'trial'|'suspended')
sites             id, property_id→properties, name, address
buildings         id, site_id→sites, name, floors
assets            id, building_id→buildings, name, category, make, model, serial_no, status
ppm_schedules     id, asset_id→assets, title, frequency, interval_days, next_due, priority
work_orders       id, property_id→properties, schedule_id, engineer_id, wo_number (unique),
                  type, status, sign_off_token, sign_off_expires_at, signed_at, pdf_url
engineers         id, property_id→properties, user_id (nullable), email, name, role_id, is_active
roles             id, property_id→properties, name
checklist_items   id, work_order_id→work_orders
inventory_items   id, property_id→properties, name, quantity
parts_used        id, work_order_id→work_orders, inventory_item_id→inventory_items
audit_log         id, property_id→properties, action, table_name, record_id
```

**Engineers email uniqueness**: NOT globally unique. Same email can appear across properties. Unique only per `(user_id, property_id)` where `user_id IS NOT NULL` (partial index).

> **Important**: After any changes to `supabase/migrations/001_initial_schema.sql`, the migration must be manually re-applied in the Supabase SQL Editor (drop all → re-run). There is no automated migration runner configured.

---

## Key Pitfalls & Bug History

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| RLS violation on INSERT even with service role | `createServiceClient` was using `createServerClient` from `@supabase/ssr`, so cookies leaked into service client | Use raw `createClient` from `@supabase/supabase-js` for service role |
| Suspended page redirect loop | `/login` redirected to `/suspended` → had "Back to login" link → loop | Login page shows suspended state inline; no redirect |
| Cross-property navigation blocked | Dashboard layout fetched property via user-scoped client → RLS `property_id` mismatch | Use service client in layout + auto-switch `app_metadata` |
| Login isolation failure | Middleware only checked `property_slug ===` (singular), not array | `LoginForm` checks `property_slugs.includes(slug)`; signs out if not found |
| `params.slug` type error | Next.js 14 pages wrap params in Promise | Always `await params` in page components and API dynamic routes |
| PDF not available immediately | PDF generation is fire-and-forget fetch after sign-off | Expected behavior — frontend should handle async PDF readiness |

---

## Multi-Property Support

One user can be superadmin in multiple properties. When this happens:
- `property_ids[]` and `property_slugs[]` in `app_metadata` contain all accessible entries
- `property_id` / `property_slug` = currently active (auto-updated on navigation)
- Topbar shows a `⇄` switcher dropdown if user has 2+ properties
- Switching calls `POST /api/switch-property` → updates `app_metadata` → `supabase.auth.refreshSession()` → navigate to new slug

Adding an existing user to a new property (same email already registered):
- Detect via `user_id` lookup in engineers table
- Merge new property UUID/slug into existing `property_ids[]` / `property_slugs[]` arrays
- Insert new engineer record for that property

---

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL        Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY   Public anon key (safe to expose)
SUPABASE_SERVICE_ROLE_KEY       Service role key (NEVER expose to client)
RESEND_API_KEY                  Resend email API key
NEXT_PUBLIC_APP_URL             Canonical URL (used for PDF callback fetch)
```

All stored in `.env.local` (not committed).
