-- 022_role_aware_rls.sql
-- Replaces the property-only RLS policies with read-only, role-aware policies that mirror the permission
-- matrix in lib/authz/permissions.ts (.github/skills/facilityppm-tenant-isolation/references/portal-role-matrix.md).
--
-- The app reads and writes data only on the server with the service role, after lib/authz checks. These
-- policies are defense in depth for the Data API, where a signed-in user's JWT reaches the database directly:
--   * anon: no table access at all.
--   * authenticated: SELECT only, scoped by role (staff: property; Service Group: assigned work;
--     tenants: their company), active membership, usable license and app_metadata.property_ids.
--   * No INSERT/UPDATE/DELETE policies and no write privileges for anon/authenticated.
--
-- Run after 019, 020 and 021. Safe to re-run.

-- ── Private helpers (not exposed through the Data API) ──────────────────────

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_provider()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'provider'
$$;

-- Active memberships of the calling user in properties with a usable license, with the canonical role.
-- Mirrors resolveMembership(): the property must be in app_metadata.property_ids, the member row active,
-- the role a current one, and a tenant's company active (otherwise the tenant has no company).
create or replace function private.my_memberships()
returns table (property_id uuid, engineer_id uuid, role text, company_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with claims as (
    select (select auth.uid()) as uid, (select auth.jwt()) -> 'app_metadata' as app_metadata
  ),
  memberships as (
    select
      e.property_id,
      e.id as engineer_id,
      -- Same normalization as lib/roles.ts roleKey(): runs of spaces, `_` and `-` become one `_`
      case regexp_replace(lower(trim(r.name)), '[[:space:]_-]+', '_', 'g')
        when 'administrator' then 'admin'
        when 'engineer' then 'head_engineer'
        else regexp_replace(lower(trim(r.name)), '[[:space:]_-]+', '_', 'g')
      end as role,
      case when c.is_active then e.company_id end as company_id
    from claims
    join public.engineers e on e.user_id = claims.uid
    join public.roles r on r.id = e.role_id
    join public.properties p on p.id = e.property_id
    left join public.tenant_companies c on c.id = e.company_id and c.property_id = e.property_id
    where claims.uid is not null
      and e.is_active
      and p.license_status <> 'suspended'
      and (p.license_expires_at is null or p.license_expires_at > now())
      and case
        when jsonb_typeof(claims.app_metadata -> 'property_ids') = 'array'
          then (claims.app_metadata -> 'property_ids') ? e.property_id::text
        else (claims.app_metadata ->> 'property_id') = e.property_id::text
      end
  )
  select property_id, engineer_id, role, company_id
  from memberships
  where role in ('admin', 'property_manager', 'head_engineer', 'service_group', 'tenant')
$$;

-- Properties where the caller is Administrator, Property Manager or Head Engineer
create or replace function private.staff_property_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select property_id from private.my_memberships() where role in ('admin', 'property_manager', 'head_engineer')
$$;

-- Properties where the caller is Administrator or Property Manager
create or replace function private.manager_property_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select property_id from private.my_memberships() where role in ('admin', 'property_manager')
$$;

-- Properties where the caller has any current role
create or replace function private.member_property_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select property_id from private.my_memberships()
$$;

-- (property, member) pairs of the caller's Service Group memberships: work orders assigned to them
create or replace function private.assigned_work()
returns table (property_id uuid, engineer_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select property_id, engineer_id from private.my_memberships() where role = 'service_group'
$$;

-- Companies of the caller's tenant memberships (active companies only)
create or replace function private.tenant_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select company_id from private.my_memberships() where role = 'tenant' and company_id is not null
$$;

-- The caller's own member rows (for personal data such as notifications)
create or replace function private.my_engineer_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select engineer_id from private.my_memberships()
$$;

revoke all on function private.is_provider() from public, anon;
revoke all on function private.my_memberships() from public, anon;
revoke all on function private.staff_property_ids() from public, anon;
revoke all on function private.manager_property_ids() from public, anon;
revoke all on function private.member_property_ids() from public, anon;
revoke all on function private.assigned_work() from public, anon;
revoke all on function private.tenant_company_ids() from public, anon;
revoke all on function private.my_engineer_ids() from public, anon;
-- Policies run as the querying role, so signed-in users must be able to execute the helpers
grant execute on function private.is_provider() to authenticated, service_role;
grant execute on function private.my_memberships() to authenticated, service_role;
grant execute on function private.staff_property_ids() to authenticated, service_role;
grant execute on function private.manager_property_ids() to authenticated, service_role;
grant execute on function private.member_property_ids() to authenticated, service_role;
grant execute on function private.assigned_work() to authenticated, service_role;
grant execute on function private.tenant_company_ids() to authenticated, service_role;
grant execute on function private.my_engineer_ids() to authenticated, service_role;

-- ── Start from a clean, deny-by-default state ───────────────────────────────

-- Drop every existing policy in public (including any created by hand in the dashboard)
do $$
declare
  pol record;
begin
  for pol in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

-- Every table in public has RLS enabled
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- No Data API writes; anon gets nothing
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from authenticated;
revoke usage, update on all sequences in schema public from authenticated;

-- Tables created later by the postgres role start without these privileges too
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate, references, trigger on tables from authenticated;

-- ── Read policies ───────────────────────────────────────────────────────────

create policy "Members read their properties" on properties
  for select to authenticated
  using ((select private.is_provider()) or id in (select private.member_property_ids()));

create policy "Signed-in users read roles" on roles
  for select to authenticated
  using ((select auth.uid()) is not null);

-- Members: staff see the property's members; everyone sees their own rows
create policy "Staff read members" on engineers
  for select to authenticated
  using (
    (select private.is_provider())
    or user_id = (select auth.uid())
    or property_id in (select private.staff_property_ids())
  );

-- Floors, companies and occupancies: staff see the property; tenants see their own company
create policy "Staff and own company read companies" on tenant_companies
  for select to authenticated
  using (
    (select private.is_provider())
    or property_id in (select private.staff_property_ids())
    or id in (select private.tenant_company_ids())
  );

create policy "Staff and own company read occupancies" on floor_occupancies
  for select to authenticated
  using (
    (select private.is_provider())
    or property_id in (select private.staff_property_ids())
    or company_id in (select private.tenant_company_ids())
  );

create policy "Staff and own company read floors" on floors
  for select to authenticated
  using (
    (select private.is_provider())
    or property_id in (select private.staff_property_ids())
    or id in (
      select fo.floor_id from public.floor_occupancies fo
      where fo.ends_on is null and fo.company_id in (select private.tenant_company_ids())
    )
  );

-- Maintenance data (sites, buildings, assets, schedules, inventory) is staff-only (D15)
create policy "Staff read sites" on sites
  for select to authenticated
  using ((select private.is_provider()) or property_id in (select private.staff_property_ids()));

create policy "Staff read buildings" on buildings
  for select to authenticated
  using (
    (select private.is_provider())
    or site_id in (select s.id from public.sites s where s.property_id in (select private.staff_property_ids()))
  );

create policy "Staff read assets" on assets
  for select to authenticated
  using (
    (select private.is_provider())
    or building_id in (
      select b.id from public.buildings b
      join public.sites s on s.id = b.site_id
      where s.property_id in (select private.staff_property_ids())
    )
  );

create policy "Staff read ppm_schedules" on ppm_schedules
  for select to authenticated
  using (
    (select private.is_provider())
    or asset_id in (
      select a.id from public.assets a
      join public.buildings b on b.id = a.building_id
      join public.sites s on s.id = b.site_id
      where s.property_id in (select private.staff_property_ids())
    )
  );

create policy "Staff read inventory" on inventory_items
  for select to authenticated
  using ((select private.is_provider()) or property_id in (select private.staff_property_ids()));

-- Work requests: staff see the property, Service Group their assigned work, tenants their company (D10, D14)
create policy "Role-scoped read work_orders" on work_orders
  for select to authenticated
  using (
    (select private.is_provider())
    or property_id in (select private.staff_property_ids())
    or (property_id, engineer_id) in (select aw.property_id, aw.engineer_id from private.assigned_work() aw)
    or company_id in (select private.tenant_company_ids())
  );

-- Work order details follow the work order: visible exactly when the caller can see the work order
create policy "Read with work order" on work_order_reports
  for select to authenticated
  using (work_order_id in (select w.id from public.work_orders w));

create policy "Read with work order" on work_order_costings
  for select to authenticated
  using (work_order_id in (select w.id from public.work_orders w));

create policy "Read with work order" on work_order_completion_evidence
  for select to authenticated
  using (work_order_id in (select w.id from public.work_orders w));

create policy "Read with work order" on checklist_items
  for select to authenticated
  using (work_order_id in (select w.id from public.work_orders w));

create policy "Read with work order" on approval_trail
  for select to authenticated
  using (work_order_id in (select w.id from public.work_orders w));

create policy "Read with work order" on service_ratings
  for select to authenticated
  using (work_order_id in (select w.id from public.work_orders w));

create policy "Read with work order" on work_order_events
  for select to authenticated
  using (work_order_id in (select w.id from public.work_orders w));

create policy "Read with work order" on work_order_comments
  for select to authenticated
  using (work_order_id in (select w.id from public.work_orders w));

-- Parts used are inventory data: staff and the assigned Service Group member only
create policy "Staff read parts_used" on parts_used
  for select to authenticated
  using (
    (select private.is_provider())
    or work_order_id in (
      select w.id from public.work_orders w
      where w.property_id in (select private.staff_property_ids())
        or (w.property_id, w.engineer_id) in (select aw.property_id, aw.engineer_id from private.assigned_work() aw)
    )
  );

-- Personal notifications
create policy "Own notifications read" on notifications
  for select to authenticated
  using (engineer_id in (select private.my_engineer_ids()));

-- Audit log: Administrators and Property Managers of the property, and providers
create policy "Managers read audit_log" on audit_log
  for select to authenticated
  using ((select private.is_provider()) or property_id in (select private.manager_property_ids()));

-- invitations and property_monday_integrations: no policies (service role only).

-- ── Indexes used by the policies ────────────────────────────────────────────

create index if not exists idx_work_orders_property_engineer on work_orders (property_id, engineer_id) where engineer_id is not null;
create index if not exists idx_buildings_site on buildings (site_id);
create index if not exists idx_assets_building on assets (building_id);
create index if not exists idx_ppm_schedules_asset on ppm_schedules (asset_id);
create index if not exists idx_inventory_items_property on inventory_items (property_id);
create index if not exists idx_parts_used_work_order on parts_used (work_order_id);
create index if not exists idx_engineers_user on engineers (user_id) where user_id is not null;
