-- 027_permission_rls.sql
-- Row Level Security driven by role permissions instead of role names (D25, D32).
--
-- private.my_grants() lists the calling user's grants: (property, member, company, permission key, scope) from
-- their active property roles. The locked Administrator role holds every staff key at property scope.
-- Membership rules are unchanged from 025: active member, a role, usable property AND organization license, the
-- property in app_metadata.property_ids or its organization in app_metadata.org_ids, and a tenant's company only
-- while it is active (and only for tenant-portal roles).
--
-- The read policies of 022 that named roles are recreated on permission keys:
--   work_orders                     workRequest.view (property | assigned | company)
--   sites, buildings, assets, ppm_schedules, inventory_items   maintenance.view
--   floors, tenant_companies, floor_occupancies                floors.view, or the tenant's own company
--   engineers                       members.view, or the caller's own rows
--   parts_used                      maintenance.view, or work assigned to the caller
--   audit_log                       audit.view
--   property_roles, property_role_permissions                 any member of the property
--   permission_keys                 any signed-in user (the catalog)
-- With the default roles every member reads exactly what 022 allowed. Still read-only: no write policies.
--
-- Run after 026. Safe to re-run. Then run supabase/tests/rls_check.sql (must return no rows).

-- ── Preconditions ──────────────────────────────────────────────────────────

do $$
begin
  if to_regclass('public.property_roles') is null then
    raise exception 'Migration 026_property_roles.sql has not been applied. Apply it, then re-run 027.';
  end if;
end $$;

-- ── Membership and grants ──────────────────────────────────────────────────

-- Active memberships of the caller with their property role
create or replace function private.my_member_roles()
returns table (
  property_id uuid,
  engineer_id uuid,
  role_id uuid,
  portal text,
  system_key text,
  is_locked boolean,
  company_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  with claims as (
    select (select auth.uid()) as uid, (select auth.jwt()) -> 'app_metadata' as app_metadata
  )
  select
    e.property_id,
    e.id,
    pr.id,
    pr.portal,
    pr.system_key,
    pr.is_locked,
    case when pr.portal = 'tenant' and c.is_active then e.company_id end
  from claims
  join public.engineers e on e.user_id = claims.uid
  join public.property_roles pr on pr.id = e.property_role_id and pr.property_id = e.property_id
  join public.properties p on p.id = e.property_id
  left join public.organizations o on o.id = p.organization_id
  left join public.tenant_companies c on c.id = e.company_id and c.property_id = e.property_id
  where claims.uid is not null
    and e.is_active
    and p.license_status <> 'suspended'
    and (p.license_expires_at is null or p.license_expires_at > now())
    and (o.id is null or (o.license_status <> 'suspended' and (o.license_expires_at is null or o.license_expires_at > now())))
    and (
      case
        when jsonb_typeof(claims.app_metadata -> 'property_ids') = 'array'
          then (claims.app_metadata -> 'property_ids') ? e.property_id::text
        else (claims.app_metadata ->> 'property_id') = e.property_id::text
      end
      or (
        p.organization_id is not null
        and jsonb_typeof(claims.app_metadata -> 'org_ids') = 'array'
        and (claims.app_metadata -> 'org_ids') ? p.organization_id::text
      )
    )
$$;

-- The caller's grants; the Administrator role gets every staff key at property scope
create or replace function private.my_grants()
returns table (property_id uuid, engineer_id uuid, company_id uuid, permission_key text, scope text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.property_id, m.engineer_id, m.company_id, k.key, 'property'
  from private.my_member_roles() m
  join public.permission_keys k on 'staff' = any (k.portals)
  where m.is_locked and m.portal = 'staff'
  union all
  select m.property_id, m.engineer_id, m.company_id, g.permission_key, g.scope
  from private.my_member_roles() m
  join public.property_role_permissions g on g.role_id = m.role_id and g.property_id = m.property_id
  where not m.is_locked
$$;

-- Properties where the caller holds the permission ($1) at property scope
create or replace function private.scope_property_ids(permission text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.property_id from private.my_grants() g where g.permission_key = $1 and g.scope = 'property'
$$;

-- (property, member) pairs where the caller holds the permission ($1) for work assigned to them
create or replace function private.scope_assigned(permission text)
returns table (property_id uuid, engineer_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select g.property_id, g.engineer_id from private.my_grants() g where g.permission_key = $1 and g.scope = 'assigned'
$$;

-- Companies where the caller holds the permission ($1) for their own company
create or replace function private.scope_company_ids(permission text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.company_id from private.my_grants() g
  where g.permission_key = $1 and g.scope = 'company' and g.company_id is not null
$$;

-- Companies of the caller's tenant-portal memberships (active companies only)
create or replace function private.my_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.company_id from private.my_member_roles() m where m.portal = 'tenant' and m.company_id is not null
$$;

-- Same signature as 022/025; the role is now the system key (or 'custom')
create or replace function private.my_memberships()
returns table (property_id uuid, engineer_id uuid, role text, company_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select m.property_id, m.engineer_id, coalesce(m.system_key, 'custom'), m.company_id from private.my_member_roles() m
$$;

-- 022 helpers, now permission-based (no policy uses them after this migration; 030 drops them)
create or replace function private.staff_property_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select private.scope_property_ids('workRequest.view')
$$;

create or replace function private.manager_property_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select private.scope_property_ids('audit.view')
$$;

create or replace function private.assigned_work()
returns table (property_id uuid, engineer_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select a.property_id, a.engineer_id from private.scope_assigned('workRequest.view') a
$$;

create or replace function private.tenant_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select private.my_company_ids()
$$;

revoke all on function private.my_member_roles() from public, anon;
revoke all on function private.my_grants() from public, anon;
revoke all on function private.scope_property_ids(text) from public, anon;
revoke all on function private.scope_assigned(text) from public, anon;
revoke all on function private.scope_company_ids(text) from public, anon;
revoke all on function private.my_company_ids() from public, anon;
revoke all on function private.my_memberships() from public, anon;
revoke all on function private.staff_property_ids() from public, anon;
revoke all on function private.manager_property_ids() from public, anon;
revoke all on function private.assigned_work() from public, anon;
revoke all on function private.tenant_company_ids() from public, anon;
-- Policies run as the querying role, so signed-in users must be able to execute the helpers
grant execute on function private.my_member_roles() to authenticated, service_role;
grant execute on function private.my_grants() to authenticated, service_role;
grant execute on function private.scope_property_ids(text) to authenticated, service_role;
grant execute on function private.scope_assigned(text) to authenticated, service_role;
grant execute on function private.scope_company_ids(text) to authenticated, service_role;
grant execute on function private.my_company_ids() to authenticated, service_role;
grant execute on function private.my_memberships() to authenticated, service_role;
grant execute on function private.staff_property_ids() to authenticated, service_role;
grant execute on function private.manager_property_ids() to authenticated, service_role;
grant execute on function private.assigned_work() to authenticated, service_role;
grant execute on function private.tenant_company_ids() to authenticated, service_role;

-- ── Read policies on permission keys ───────────────────────────────────────

drop policy if exists "Staff read members" on engineers;
create policy "Staff read members" on engineers
  for select to authenticated
  using (
    (select private.is_provider())
    or user_id = (select auth.uid())
    or property_id in (select private.scope_property_ids('members.view'))
  );

drop policy if exists "Staff and own company read companies" on tenant_companies;
create policy "Staff and own company read companies" on tenant_companies
  for select to authenticated
  using (
    (select private.is_provider())
    or property_id in (select private.scope_property_ids('floors.view'))
    or id in (select private.my_company_ids())
  );

drop policy if exists "Staff and own company read occupancies" on floor_occupancies;
create policy "Staff and own company read occupancies" on floor_occupancies
  for select to authenticated
  using (
    (select private.is_provider())
    or property_id in (select private.scope_property_ids('floors.view'))
    or company_id in (select private.my_company_ids())
  );

drop policy if exists "Staff and own company read floors" on floors;
create policy "Staff and own company read floors" on floors
  for select to authenticated
  using (
    (select private.is_provider())
    or property_id in (select private.scope_property_ids('floors.view'))
    or id in (
      select fo.floor_id from public.floor_occupancies fo
      where fo.ends_on is null and fo.company_id in (select private.my_company_ids())
    )
  );

drop policy if exists "Staff read sites" on sites;
create policy "Staff read sites" on sites
  for select to authenticated
  using ((select private.is_provider()) or property_id in (select private.scope_property_ids('maintenance.view')));

drop policy if exists "Staff read buildings" on buildings;
create policy "Staff read buildings" on buildings
  for select to authenticated
  using (
    (select private.is_provider())
    or site_id in (
      select s.id from public.sites s where s.property_id in (select private.scope_property_ids('maintenance.view'))
    )
  );

drop policy if exists "Staff read assets" on assets;
create policy "Staff read assets" on assets
  for select to authenticated
  using (
    (select private.is_provider())
    or building_id in (
      select b.id from public.buildings b
      join public.sites s on s.id = b.site_id
      where s.property_id in (select private.scope_property_ids('maintenance.view'))
    )
  );

drop policy if exists "Staff read ppm_schedules" on ppm_schedules;
create policy "Staff read ppm_schedules" on ppm_schedules
  for select to authenticated
  using (
    (select private.is_provider())
    or asset_id in (
      select a.id from public.assets a
      join public.buildings b on b.id = a.building_id
      join public.sites s on s.id = b.site_id
      where s.property_id in (select private.scope_property_ids('maintenance.view'))
    )
  );

drop policy if exists "Staff read inventory" on inventory_items;
create policy "Staff read inventory" on inventory_items
  for select to authenticated
  using ((select private.is_provider()) or property_id in (select private.scope_property_ids('maintenance.view')));

drop policy if exists "Role-scoped read work_orders" on work_orders;
create policy "Role-scoped read work_orders" on work_orders
  for select to authenticated
  using (
    (select private.is_provider())
    or property_id in (select private.scope_property_ids('workRequest.view'))
    or (property_id, engineer_id) in (select a.property_id, a.engineer_id from private.scope_assigned('workRequest.view') a)
    or company_id in (select private.scope_company_ids('workRequest.view'))
  );

drop policy if exists "Staff read parts_used" on parts_used;
create policy "Staff read parts_used" on parts_used
  for select to authenticated
  using (
    (select private.is_provider())
    or work_order_id in (
      select w.id from public.work_orders w
      where w.property_id in (select private.scope_property_ids('maintenance.view'))
        or (w.property_id, w.engineer_id) in (select a.property_id, a.engineer_id from private.scope_assigned('workRequest.view') a)
    )
  );

drop policy if exists "Managers read audit_log" on audit_log;
create policy "Managers read audit_log" on audit_log
  for select to authenticated
  using ((select private.is_provider()) or property_id in (select private.scope_property_ids('audit.view')));

drop policy if exists "Members read property roles" on property_roles;
create policy "Members read property roles" on property_roles
  for select to authenticated
  using ((select private.is_provider()) or property_id in (select private.member_property_ids()));

drop policy if exists "Members read role permissions" on property_role_permissions;
create policy "Members read role permissions" on property_role_permissions
  for select to authenticated
  using ((select private.is_provider()) or property_id in (select private.member_property_ids()));

drop policy if exists "Signed-in users read permission keys" on permission_keys;
create policy "Signed-in users read permission keys" on permission_keys
  for select to authenticated
  using ((select auth.uid()) is not null);

-- ── Indexes used by the policies ───────────────────────────────────────────

create index if not exists idx_engineers_user_property_role on engineers (user_id, property_role_id) where user_id is not null;
