# Portal & Role Permission Matrix

Target model for the 3-portal rewrite. **Deny by default**: an action not listed, or a role without ✅/🔒,
is forbidden. Cells tagged `Dn` were defaulted when the rewrite was planned — see the
[decision log](#decision-log) and update both the cell and the log if the product owner overrides one.

Legend: ✅ allowed · 🔒 allowed with the scope noted · ❌ forbidden

## Roles

| Portal | Role (spec) | Code value | Where it lives | Scope |
|---|---|---|---|---|
| Provider Dashboard | Provider | `app_metadata.role = 'provider'` | Supabase `app_metadata` (service role only) | All properties |
| Admin Portal | Administrator | `admin` | `engineers.role_id → roles.name` per property | One property |
| Admin Portal | Property Manager | `property_manager` | same | One property |
| Admin Portal | Head Engineer | `head_engineer` | same | One property |
| Admin Portal | Service Group | `service_group` (stored as `'service group'` before migration 020) | same | Work assigned to them |
| Tenant Portal | Tenant | `tenant` | same, plus `engineers.company_id` | Their company's floor(s) |
| — | Viewer (legacy) | `viewer` | `lib/roles.ts` | **Retired** (D1) — no access |

A user can belong to several properties (`app_metadata.property_ids[]`) with a different role in each.
Always resolve the role **for the property being acted on**, not the "active" one. A user with no active
`engineers` row for that property has no access to it, whatever `app_metadata` says.

## Provider Dashboard

| Action | Provider | Any property role |
|---|---|---|
| Create property account (property + first Administrator) | ✅ (D18) | ❌ |
| Terminate property account: suspend, deactivate members, ban sessions | ✅ (D18) | ❌ |
| Hard-delete a property (typed confirmation) | ✅ | ❌ |
| Add, revoke, suspend, renew license (`license_status`, `license_expires_at`) | ✅ (D17) | ❌ |
| View activity of any property (work orders, events, audit log, KPIs) | ✅ read | ❌ |
| Create/deactivate user accounts in any property | ✅ | ❌ |
| Manage provider users | ❌ in app — Supabase dashboard only | ❌ |
| Open a property's Admin Portal | 🔒 read-only support view, audit-logged (D2) | ❌ |

## Admin Portal — property customization

| Action | Admin | Property Mgr | Head Eng | Service Group | Tenant |
|---|---|---|---|---|---|
| Edit property profile (name, legal name, fax, terms) | ✅ | ✅ (D3) | ❌ | ❌ | ❌ |
| Add / rename / remove floors | ✅ | ❌ (D4) | ❌ | ❌ | ❌ |
| Set the tenant company for a floor | ✅ | ❌ (D4) | ❌ | ❌ | ❌ |
| Remove a tenant company from a floor | ✅ | ❌ (D4) | ❌ | ❌ | ❌ |
| Add / edit / deactivate tenant companies | ✅ | ✅ (D5) | ❌ | ❌ | ❌ |
| Invite / deactivate tenant users (under a company) | ✅ | ✅ (D5) | ❌ | ❌ | ❌ |
| Invite / deactivate Head Engineer, Service Group | ✅ | ✅ (D6) | ❌ | ❌ | ❌ |
| Invite / deactivate Administrator, Property Manager | ✅ | ❌ (D6) | ❌ | ❌ | ❌ |
| Change a member's role | ✅ (never to/from provider) | 🔒 only between Head Engineer / Service Group (D6) | ❌ | ❌ | ❌ |
| Integrations (e.g. Monday.com) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Assets, PPM schedules, reports (existing modules) | ✅ | ✅ | ✅ | ❌ | ❌ (D15) |

## Work requests

| Action | Admin | Property Mgr | Head Eng | Service Group | Tenant |
|---|---|---|---|---|---|
| Submit a work request | 🔒 on behalf of a company (D7) | 🔒 on behalf (D7) | 🔒 on behalf (D7) | ❌ | 🔒 own company, own floor(s) |
| View work requests | ✅ property | ✅ property | ✅ property | 🔒 assigned (D14) | 🔒 own company (D10) |
| Review: start inspection, prepare/revise costing, verify | ✅ | ✅ | ✅ | ❌ | ❌ |
| Record inspection findings | ✅ | ✅ | ✅ | 🔒 assigned (D20) | ❌ |
| Waive charges (and remove a waiver) | ❌ (D8) | ✅ (D8) | ❌ (D8) | ❌ | ❌ |
| View the Waived Orders list | ✅ | ✅ | ❌ | ❌ | ❌ |
| Assign engineers / Service Group | ✅ | ✅ | ✅ | ❌ | ❌ |
| Start work, update progress, upload completion evidence | ✅ | ✅ | ✅ | 🔒 assigned (D14) | ❌ |
| Cancel | ✅ | ✅ | ✅ (D9) | ❌ | 🔒 own company, status `new_report` only (D9) |
| Approve / reject costing | ❌ | ❌ | ❌ | ❌ | 🔒 own company, in portal or token link (D13) |
| Sign off / reject completion | ❌ | ❌ | ❌ | ❌ | 🔒 own company, in portal or token link (D13) |
| Comment | ✅ | ✅ | ✅ | 🔒 assigned | 🔒 own company |
| Download PDFs (report, receipt, costing, audit) | ✅ | ✅ | ✅ | 🔒 assigned | 🔒 own company |

## Scope rules that every check must apply

- **Property**: `record.property_id ∈ app_metadata.property_ids` (provider bypass only for provider actions
  and the read-only support view).
- **Membership**: an `engineers` row for `(user_id, property_id)` with `is_active = true` and a role from
  the table above. Missing row, inactive row, empty or retired role ⇒ deny.
- **Role**: role of that row is in the ✅/🔒 set for the action.
- **Tenant company**: `record.company_id = actor.company_id`. Never use free-text email/contact matching.
- **Service Group assignment**: `record.engineer_id = actor.engineer_id`.
- **License**: property `license_status <> 'suspended'` and not past `license_expires_at` for every
  non-provider action.

## Data model (rewrite)

All tables carry `property_id` and have RLS enabled.

- `floors (id, property_id, building_id null, label, level, sort_order)`, unique `(property_id, label)` (D12)
- `tenant_companies (id, property_id, name, contact_email, contact_phone, is_active)`
- `floor_occupancies (id, property_id, floor_id, company_id, starts_on, ends_on null)`, at most one row with
  `ends_on is null` per floor; one company may occupy several floors (D11)
- `engineers.company_id` — required for `tenant` members, null for staff
- `work_orders.company_id`, `work_orders.floor_id` — set server-side from the submitter's company and the
  floor they pick from that company's occupied floors, never trusted from the request body

## Decision log

Defaults chosen on 2026-11-03 while planning the rewrite (least privilege, keeping current behavior where
the spec is silent). Override by editing the table cell and the entry here.

| ID | Decision | Why |
|---|---|---|
| D1 | `viewer` is retired: no portal access; existing viewers are deactivated and listed for an Admin to reassign | Not in the spec; least privilege |
| D2 | Provider sees a property's Admin Portal read-only; changes go through the Provider Dashboard | Today the provider silently becomes `admin`; writes should be explicit and audited |
| D3 | Property Manager may edit the property profile | Matches current code (`MANAGE_ROLES`) |
| D4 | Floors and floor-tenant assignment are Administrator-only | Spec: "Administrators can also customize their property" |
| D5 | Admin and Property Manager manage tenant companies and tenant users | Spec: Admin Portal users "add tenants"; PM "manages the building" |
| D6 | PM manages Head Engineer / Service Group / tenants but not Admins or other PMs | Prevents privilege escalation by PMs |
| D7 | Admin, PM, Head Engineer may submit on behalf of a tenant company (must pick company + floor) | Current admin "Service Report" page does this |
| D8 | Waiving charges is **Property Manager only** (user override 2026-11-05); Admins and PMs can view the Waived Orders list | Product owner decision |
| D9 | Head Engineer may cancel; tenants may cancel their company's request only while `new_report` | Head Engineer leads the job; tenants can withdraw before inspection starts |
| D10 | Tenants see all requests of their company, not only their own submissions | Spec frames the portal per company |
| D11 | A company can occupy several floors; a floor has at most one current company | Spec: each floor is occupied by a different company |
| D12 | Floors belong to the property (optional `building_id`); sites/buildings stay for assets | One building per property today |
| D13 | Emailed token links for costing approval and sign-off stay, hardened (hashed, atomic single use), alongside in-portal approval | External tenant contacts may not have accounts |
| D14 | Service Group only sees and acts on work orders assigned to them | Spec: "personnel who can be assigned to work requests" |
| D15 | Assets, PPM schedules, inventory and reports are kept as-is (staff only); only authorization and RLS are hardened | Not in the spec; avoid scope creep |
| D16 | Tests: Vitest for the permission matrix and route guards; RLS verified with a SQL script on a staging project | No test runner exists today |
| D17 | Licenses = existing `license_status` (`active`/`trial`/`suspended`) + new `license_expires_at`; expired is treated as suspended; changes audit-logged | Spec: "add and revoke licenses" |
| D18 | "Account" = a property account. Terminate = suspend license, deactivate all members, ban their auth users; hard delete stays a separate typed-confirmation action | Spec: "create and terminate accounts"; termination must be reversible by default |
| D19 | Existing tenant users are **not** auto-linked to companies (user decision 2026-11-05). Until an Admin/PM links them, they see a "not linked to a company" page and no requests; linking also sets `company_id` on their earlier requests; work orders without a company stay staff-only | Avoids guessing company membership from free text |
| D20 | The Service Group member assigned to inspect a request may record the inspection findings | The workflow assigns a Service Group member as inspector |

The matrix in code is `lib/authz/permissions.ts`; `tests/authz/permissions.test.ts` mirrors this file row by row.
