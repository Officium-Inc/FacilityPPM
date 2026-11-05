---
name: facilityppm-tenant-isolation
description: "FacilityPPM multi-tenant authorization and tenant-isolation rules for the Provider Dashboard, Admin Portal and Tenant Portal. Use when adding or reviewing API routes (app/api/**), server actions, middleware, portal layouts, Supabase clients, RLS policies or migrations (supabase/migrations/**), roles/permissions (lib/roles.ts), public token links (sign-off, costing-approval, invite), storage uploads, or when asked for a security/authz review, IDOR check, tenant-isolation audit or permission matrix for this project."
argument-hint: "Optional path or feature to review, e.g. app/api/work-orders or 'floor management'"
---

# FacilityPPM Tenant Isolation

Project-specific security rules for a multi-tenant building portal on Next.js 14 + Supabase.
Generic guidance lives in the `security-best-practices`, `supabase` and `supabase-postgres-best-practices`
skills; this skill encodes **who may do what to which property / floor / company** in this codebase.

## Trust model

Three portals share one Supabase project. The **Provider** (`app_metadata.role = 'provider'`) controls every
property. Inside a property, **staff** (Administrator, Property Manager, Head Engineer, Service Group) run the
Admin Portal and **Tenants** (one company per floor) use the Tenant Portal. Property scope comes from
`app_metadata.property_ids[]` (service-role controlled); the per-property role comes from
`engineers.role_id → roles.name` (resolved server-side). The browser holds the anon key **and** the user JWT,
so anything RLS allows can be read or written directly through the Supabase Data API — the Next.js layer
is not the only gate.

## Non-negotiable invariants

1. **Deny by default.** Every route handler, server action and RLS policy grants the minimum role set from
   [portal-role-matrix.md](./references/portal-role-matrix.md). Unknown/empty role ⇒ 403.
2. **Authenticate with `supabase.auth.getUser()`** (server-validated), never `getSession()` alone.
3. **Authorize before any `createServiceClient()` read or write.** The service client bypasses RLS; the
   handler must already have checked property membership **and** role (and tenant company ownership).
4. **Authorization data only from `app_metadata` or DB rows.** Never `user_metadata`, request body, query
   string, headers or cookies for role/property decisions. Body-supplied `property_id`/`slug` must be checked
   against `app_metadata.property_ids` / `property_slugs` (`includes`, not equality with the active one).
5. **Tenants are scoped to their own company/floor**, not just the property. Property-level RLS
   (`property_id = jwt.property_id`) alone lets a tenant read other tenants' work requests.
6. **Deactivated members lose access everywhere**: check `engineers.is_active` in every authz helper.
7. **Provider-only operations** (create/terminate accounts, add/revoke licenses, cross-property activity)
   check `app_metadata.role === 'provider'` server-side; middleware redirects are not authorization.
8. **Suspended licenses block the property** for all non-provider roles in both pages and API routes.
9. **Public token links** (sign-off, costing-approval, invite): high-entropy token, expiry, single use,
   bound to one record, minimal data returned, and never an RLS policy like `token IS NOT NULL` or `USING (true)`.
10. **Every table in `public` has RLS enabled** with role-aware policies; no `auth.role() = 'authenticated'`
    as the only predicate; no `USING (true)` / `WITH CHECK (true)` for `anon`/`authenticated`.
11. **Secrets stay server-side**: `SUPABASE_SERVICE_ROLE_KEY` only in `lib/supabase/server.ts`; nothing secret
    in `NEXT_PUBLIC_*`; `'use client'` files never import `@/lib/supabase/server`.
12. **Storage paths are property-prefixed** (`<property_id>/…`) and URLs from clients are re-validated
    (see `sanitizeServiceReportPhotoUrls` in `lib/tenant-submit.ts`).

Details, code templates and RLS templates: [supabase-authz-patterns.md](./references/supabase-authz-patterns.md).

## Procedure — writing new code

1. Locate the action in [portal-role-matrix.md](./references/portal-role-matrix.md). If it is missing, stop
   and ask the user which roles may perform it, then add it to the matrix (and the decision log) before
   implementing. Cells tagged `Dn` are defaults — follow them unless the user overrides.
2. Server entry point: use the API route template in
   [supabase-authz-patterns.md](./references/supabase-authz-patterns.md#api-route-template). Reuse existing
   helpers (`authorizeWorkOrderStaff`, `canViewWorkOrder`, `resolveTenantSubmitter`,
   `requireMondayPropertyAdmin`, `getTenantPortalContext`) or add a new one in `lib/` — do not scatter
   ad-hoc role string comparisons across routes.
3. Database change: add a new numbered migration in `supabase/migrations/` that enables RLS and adds
   role-aware policies in the same file (templates in the reference). Load `supabase-postgres-best-practices`.
4. UI: hide controls the role cannot use, but treat that as UX only — the server check is the control.
5. Run the audit script (below) and resolve new HIGH findings before finishing.

## Procedure — reviewing / auditing

1. Run the audit script from the repo root:
   ```sh
   node .github/skills/facilityppm-tenant-isolation/scripts/audit-tenant-isolation.mjs
   ```
   Options: `--json` (machine output), `--all` (include passing handlers), `--strict` (exit 1 on HIGH),
   `--root <dir>`. It uses the project's `typescript` devDependency (run `pnpm install` first).
2. Triage each finding by reading the handler and the helpers it calls. The script is heuristic: it detects
   the *presence* of checks, not their correctness. Confirm each check covers the right property/record.
3. For each handler, answer: who can call it (anon / any member / role X / provider)? Which property and
   record does it touch, and where does that id come from? Does it use the service client? Does the role
   matrix allow this caller?
4. For RLS findings, read the **effective** policy set (later migrations may drop/replace earlier ones;
   the script reports the last definition per policy). Migrations are applied manually, so the live
   database can differ — confirm in the Supabase dashboard when it matters.
5. Report findings by severity: **HIGH** = cross-property/cross-tenant read or write, privilege escalation,
   unauthenticated service-client use; **MEDIUM** = missing role check within a property, weak token flow;
   **LOW** = defense-in-depth gaps. Include file:line and a concrete abuse path for each.
6. Fix one finding at a time, keep behavior for legitimate roles, and re-run the script.

Suppressing a reviewed false positive: add `// audit-allow: <reason>` inside the handler (or
`// audit-allow-file: <reason>` near the top of the file). Always include the reason.

## Known sharp edges in the current code (pre-rewrite)

- RLS on `work_orders`, `work_order_reports`, `work_order_costings`, etc. scopes by `property_id` only —
  tenants of a property can query every request in that property via the Data API.
- Several 001/002 policies use `auth.role() = 'authenticated'`, `USING (true)` / `WITH CHECK (true)`, and
  `sign_off_token IS NOT NULL` / `costing_token IS NOT NULL` (grants access by token *presence*, not match).
- `invitations` has `FOR SELECT USING (true)` — anyone with the anon key can list invitation tokens.
- `GET /api/pdf/[workOrderId]` and `GET /api/pdf/[workOrderId]/costing` have no authentication and use the
  service client; `GET /api/work-orders/[id]/comments` and `POST /api/work-orders/[id]/upload` authenticate
  but never check that the work order belongs to the caller's property.
- `evidence` and `receipts` storage buckets are public with bucket-wide `TO public` SELECT policies.
- `app/[slug]/(dashboard)/work-orders/[id]/page.tsx` loads any work order by id with the service client and
  never checks that it belongs to the property in the URL (cross-property read by changing the id).
- `authorizeWorkOrderStaff` only rejects `tenant`/`viewer`: a user with no `engineers` row (empty role), a
  deactivated member, and Service Group all pass as "staff".
- `WorkOrderActions.handleStatusChange` updates `work_orders.status` from the browser, relying on RLS.
- `app/[slug]/(dashboard)/layout.tsx` gives users without an `engineers` row the `viewer` role instead of
  denying access.
- `isTenantOwnedRequest` (`lib/tenant.ts`) falls back to substring email matching (`contact.includes(email)`).
- `resolveWorkOrderActor` (`lib/work-order-events.ts`) does not check `engineers.is_active`.
- Role names are inconsistent: `'service group'` contains a space while the others are snake_case
  (the rewrite renames it to `service_group`).
- Public tokens are stored and compared in plaintext (`.eq('sign_off_token', token)`).

Verify each against the current code before reporting — this list reflects the codebase when the skill was written.
