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
so anything RLS allows can be read directly through the Supabase Data API — the Next.js layer is not the
only gate. Since migration 022 RLS is read-only and mirrors the matrix (D25); all writes go through route
handlers with the service role after `lib/authz` checks, so those checks are the real write boundary.

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
9. **Public token links** (sign-off, costing-approval, invite): high-entropy token (`generateLinkToken()`),
   stored only as `hashToken()` in `*_token_hash` (D27), expiry, single use, bound to one record, minimal data
   returned, never sent back to the browser, and never an RLS policy like `token IS NOT NULL` or `USING (true)`.
10. **Every table in `public` has RLS enabled** with read-only, role-aware policies built on the `private`
    helpers (D25); no INSERT/UPDATE/DELETE policies; no `auth.role() = 'authenticated'` as the only predicate;
    no `USING (true)` / `WITH CHECK (true)` for `anon`/`authenticated`.
11. **Secrets stay server-side**: `SUPABASE_SERVICE_ROLE_KEY` only in `lib/supabase/server.ts`; nothing secret
    in `NEXT_PUBLIC_*`; `'use client'` files never import `@/lib/supabase/server`.
12. **Files are private** (D26): buckets have no storage policies; browsers get files only through
    `/api/files/<bucket>/<path>` (authorizes `workRequest.view` on the owning work order) or short-lived signed
    URLs on token pages. Storage paths are property/work-order prefixed, every path shape is mapped by
    `fileOwnerFromPath()` (`lib/storage-urls.ts`), and URLs from clients are re-validated
    (`sanitizeWorkOrderFileUrls`, `sanitizeServiceReportPhotoUrls`).

Details, code templates and RLS templates: [supabase-authz-patterns.md](./references/supabase-authz-patterns.md).

## Procedure — writing new code

1. Locate the action in [portal-role-matrix.md](./references/portal-role-matrix.md). If it is missing, stop
   and ask the user which roles may perform it, then add it to the matrix (and the decision log) before
   implementing. Cells tagged `Dn` are defaults — follow them unless the user overrides.
2. Server entry point: route handlers call `requireSession()` then `authorize(session, '<action>', { record })`
   (or `{ propertyId }`) from `lib/authz/guard.ts`; Provider Dashboard routes call `requireProvider()`; pages call
   `requirePage(slug, '<action>')` / `requirePageRecord(...)`. Work order queries select
   `WORK_ORDER_SCOPE_COLUMNS` (`lib/authz/records.ts`) before authorizing. New actions go into
   `lib/authz/permissions.ts` **and** `tests/authz/permissions.test.ts`. Never compare role strings in routes.
3. Database change: add a new numbered, re-runnable migration in `supabase/migrations/` that enables RLS and
   adds a role-aware SELECT policy built on the `private` helpers in the same file (templates in the
   reference); no write policies. Extend `supabase/tests/rls_check.sql` for new tables. Load
   `supabase-postgres-best-practices`.
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

## Known sharp edges (after the rewrite, verified 2026-11-05)

- **The service client bypasses RLS everywhere.** RLS (022) is defense in depth for the Data API only; a route
  or page that forgets `authorize()` / `requirePage*()` leaks data regardless of policies. The audit script
  detects missing checks heuristically, not wrong ones (e.g. authorizing the active property instead of the
  record's property).
- **Migrations are applied by hand.** The live database can lag behind `supabase/migrations/`; run
  `supabase/tests/rls_check.sql` (empty result = pass) after applying 022–024 and before trusting RLS.
- **Middleware is routing only.** `property_slugs.includes(slug)` lets a user reach a property's URLs; access
  still needs an active `engineers` row with a current role (`resolveMembership()`).
- **Stored file URLs are identifiers, not links** (D26). Passing raw `photo_urls` / `pdf_url` / `audit_report_url`
  to a browser shows broken files; pass data through `withFileRouteUrls()` or `withSignedFileUrls()`. A new
  upload path shape must be added to `fileOwnerFromPath()`, or `/api/files` answers 404.
- **`.contains()` on `jsonb` columns** (`photo_urls`, `*_photo_urls`, `supporting_doc_urls`): a JS array is sent
  as a Postgres array literal and never matches; pass `JSON.stringify([...])`.
- **`ScopedRecord` still carries `tenant_email`, `reported_by_contact` and `requested_by_id`**, but `can()`
  ignores them: tenant scope is `company_id` only (D10, D19). Never reintroduce email or submitter matching.
- **Legacy statuses are still handled**: `signed` (tenant signed, not verified) and `svc_submitted` with a
  sign-off link (`isAwaitingSignOff()`, D22). Keep them until no rows use them.
- **Raw token columns still exist** (`sign_off_token`, `costing_token`, `invitations.token`), always null and
  blocked by CHECK constraints (024). Write only `*_token_hash`.
- **`roles` is readable by every signed-in user** (role names only, all properties) — acceptable, but don't add
  sensitive columns to it.
- **Providers are read-only inside a property** (D2): a new write action must have `provider: false` in
  `PERMISSIONS` unless it belongs to the Provider Dashboard.

Fixed by the rewrite (for reviewing older branches): property-only RLS, `USING (true)` / token-presence /
public invitation policies, unauthenticated PDF routes, cross-property work order reads, staff checks that let
empty/deactivated/Service Group roles through, browser status writes, `viewer` fallback in the layout, email
substring matching for tenants, `'service group'` role name, public buckets and plaintext tokens.

Verify each against the current code before reporting — this list reflects the codebase on the date above.
