# Portal & Role Permission Matrix

Target model for the 3-portal rewrite. **Deny by default**: an action not listed, or a role without ✅,
is forbidden. ❓ = not decided by the product spec — ask the user before implementing and then update
this table.

Legend: ✅ allowed · 🔒 allowed with the scope noted · ❌ forbidden · ❓ decide before implementing

## Roles

| Portal | Role (spec) | Code value | Where it lives | Scope |
|---|---|---|---|---|
| Provider Dashboard | Provider | `app_metadata.role = 'provider'` | Supabase `app_metadata` (service role only) | All properties |
| Admin Portal | Administrator | `admin` | `engineers.role_id → roles.name` per property | One property |
| Admin Portal | Property Manager | `property_manager` | same | One property |
| Admin Portal | Head Engineer | `head_engineer` | same | One property |
| Admin Portal | Service Group | `service group` (note the space) | same | Assigned work only |
| Tenant Portal | Tenant | `tenant` | same, plus company/floor link | Own company's floor(s) |
| — | Viewer (legacy) | `viewer` | `lib/roles.ts` | ❓ not in spec — keep, remap or remove in rewrite |

A user can belong to several properties (`app_metadata.property_ids[]`) with a different role in each.
Always resolve the role **for the property being acted on**, not the "active" one.

## Provider Dashboard

| Action | Provider | Any property role |
|---|---|---|
| Create property account (property + first Administrator) | ✅ | ❌ |
| Terminate property account / delete property | ✅ | ❌ |
| Add, revoke, suspend, renew license (`license_status`) | ✅ | ❌ |
| View activity of any property (work orders, audit log, KPIs) | ✅ read | ❌ |
| Create/terminate user accounts in any property | ✅ | ❌ |
| Manage provider users | ❓ (currently Supabase dashboard only) | ❌ |
| Act inside a property's Admin Portal | ❓ read-only support access vs full | ❌ |

## Admin Portal — property customization

| Action | Admin | Property Mgr | Head Eng | Service Group | Tenant |
|---|---|---|---|---|---|
| Edit property profile (name, legal name, fax, terms) | ✅ | ❓ (current code allows) | ❌ | ❌ | ❌ |
| Add / remove floors | ✅ | ❌ | ❌ | ❌ | ❌ |
| Set the tenant company for a floor | ✅ | ❌ | ❌ | ❌ | ❌ |
| Remove a tenant company from a floor | ✅ | ❌ | ❌ | ❌ | ❌ |
| Add tenant company / invite tenant users | ✅ | ✅ | ❓ | ❌ | ❌ |
| Deactivate tenant users | ✅ | ✅ | ❌ | ❌ | ❌ |
| Invite / deactivate staff (PM, Head Eng, Service Group) | ✅ | ❓ | ❌ | ❌ | ❌ |
| Change a member's role | ✅ (never to/from provider) | ❌ | ❌ | ❌ | ❌ |
| Integrations (e.g. Monday.com) | ✅ | ✅ (current code) | ❌ | ❌ | ❌ |

## Work requests

| Action | Admin | Property Mgr | Head Eng | Service Group | Tenant |
|---|---|---|---|---|---|
| Submit a work request | ❓ on behalf | ❓ on behalf | ❓ on behalf | ❌ | 🔒 own company/floor |
| View work requests | ✅ property | ✅ property | ✅ property | 🔒 assigned to them | 🔒 own company |
| Review (triage, inspect, costing, verify) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Waive | ✅ | ✅ | ❓ | ❌ | ❌ |
| Assign engineers / Service Group | ✅ | ✅ | ✅ | ❌ | ❌ |
| Update progress, upload completion evidence | ✅ | ✅ | ✅ | 🔒 assigned | ❌ |
| Cancel | ✅ | ✅ | ❓ | ❌ | ❓ own, before assignment |
| Approve costing / sign off completion | ❌ | ❌ | ❌ | ❌ | 🔒 own company (portal or token link) |
| Comment | ✅ | ✅ | ✅ | 🔒 assigned | 🔒 own company |
| Download PDFs (report, receipt, audit) | ✅ | ✅ | ✅ | 🔒 assigned | 🔒 own company |

## Scope rules that every check must apply

- **Property**: `record.property_id ∈ app_metadata.property_ids` (provider bypass only for provider actions).
- **Membership**: an `engineers` row for `(user_id, property_id)` with `is_active = true`.
- **Role**: role of that row is in the ✅/🔒 set for the action.
- **Tenant company**: `record.company_id` (or floor → company) ∈ the tenant's companies. Do not use
  free-text email/contact matching as the ownership test.
- **Service Group assignment**: `record.engineer_id` (or assignment table) = the actor's engineer id.
- **License**: property `license_status <> 'suspended'` for every non-provider action.

## Data model notes for the rewrite

The current schema has `buildings.floors` (an integer) and no company/floor ownership. To enforce the
matrix in RLS and in code, plan for tables along these lines (all with `property_id` and RLS):

- `floors (id, property_id, building_id, label, sort_order)`
- `tenant_companies (id, property_id, name, …)`
- `floor_occupancies (floor_id, company_id, starts_on, ends_on)` — one active company per floor
- tenant membership: `engineers.company_id` (or a `company_members` table) for `tenant` role users
- `work_orders.company_id` / `floor_id` set server-side from the submitter's membership, never from the body
