-- supabase/tests/rls_check.sql
-- Verifies the permission-driven RLS (migrations 022, 025, 026, 027) against the data in this database. Run it on
-- staging first: paste into the Supabase SQL Editor and run. It changes nothing: everything happens in a
-- transaction that is rolled back. The result lists one row per failed check; an empty result means every check
-- passed.
--
-- Structure checks: every property has exactly one locked Administrator role, grants fit their role's portal and
-- scope, and every active member has a property role.
--
-- For each active member (up to 300) it impersonates that user (role `authenticated` with JWT claims that only
-- include that property) and compares what they can read with their role's grants:
--   * workRequest.view property → every work order of the property; assigned → only work assigned to them;
--     company → only their company's; none → nothing (and nothing at all while a license is blocked)
--   * maintenance data only with maintenance.view, the audit log only with audit.view, other members only with
--     members.view
--   * nothing of another property, no invitations, no organization rows without org_ids, no Data API writes
-- For each active Org Admin (up to 100) it impersonates them with only `org_ids` in the claims: their organization
-- and its members, no other organization, and every work order of the organization's properties.
-- It also checks that `anon` reads nothing.

begin;

create temp table rls_check_failures (
  member_email text,
  property_id uuid,
  role text,
  check_name text,
  detail text
);

-- The scope a role holds for a permission key (the locked Administrator role: every staff key at property scope)
create function pg_temp.grant_scope(p_role uuid, p_key text)
returns text
language sql
stable
as $$
  select case
    when r.is_locked then (select 'property' from public.permission_keys k where k.key = p_key and 'staff' = any (k.portals))
    else (select g.scope from public.property_role_permissions g where g.role_id = r.id and g.permission_key = p_key)
  end
  from public.property_roles r
  where r.id = p_role
$$;

-- ── Structure ──────────────────────────────────────────────────────────────

insert into rls_check_failures
select null, p.id, 'admin', 'one locked Administrator role',
       format('%s locked roles', (select count(*) from public.property_roles r where r.property_id = p.id and r.is_locked))
from public.properties p
where (select count(*) from public.property_roles r where r.property_id = p.id and r.is_locked) <> 1;

insert into rls_check_failures
select null, r.property_id, r.name, 'grant fits the role',
       format('%s (%s) on a %s role', g.permission_key, g.scope, r.portal)
from public.property_role_permissions g
join public.property_roles r on r.id = g.role_id
join public.permission_keys k on k.key = g.permission_key
where not (r.portal = any (k.portals))
   or not (g.scope = any (k.scopes))
   or (r.portal = 'staff' and g.scope not in ('property', 'assigned'))
   or (r.portal = 'tenant' and g.scope <> 'company')
   or r.is_locked;

insert into rls_check_failures
select e.email, e.property_id, null, 'member has a role', 'active member without a property role (no access)'
from public.engineers e
where e.is_active and e.user_id is not null and e.property_role_id is null;

do $$
declare
  m record;
  v_total bigint;
  v_visible bigint;
  v_bad bigint;
  v_failed text[];
  v_view text;
  v_maintenance text;
  v_members text;
  v_audit text;
  v_tables text[] := array[
    'properties', 'sites', 'buildings', 'assets', 'roles', 'engineers', 'ppm_schedules', 'work_orders',
    'checklist_items', 'inventory_items', 'parts_used', 'audit_log', 'invitations', 'work_order_reports',
    'work_order_costings', 'work_order_completion_evidence', 'service_ratings', 'approval_trail',
    'work_order_comments', 'notifications', 'property_monday_integrations', 'work_order_events',
    'floors', 'tenant_companies', 'floor_occupancies',
    'organizations', 'organization_members', 'organization_invitations',
    'permission_keys', 'property_roles', 'property_role_permissions'
  ];
  v_table text;
begin
  -- anon: no rows (or no privilege) on every table
  execute 'set local role anon';
  foreach v_table in array v_tables loop
    begin
      execute format('select count(*) from public.%I', v_table) into v_visible;
      if v_visible > 0 then
        execute 'reset role';
        insert into rls_check_failures values (null, null, 'anon', 'anon reads nothing', format('%s rows visible in %s', v_visible, v_table));
        execute 'set local role anon';
      end if;
    exception when insufficient_privilege then
      null; -- expected
    end;
  end loop;
  execute 'reset role';

  for m in
    select
      e.id as engineer_id,
      e.user_id,
      e.email,
      e.property_id,
      pr.id as role_id,
      pr.name as role_name,
      pr.portal,
      case when pr.portal = 'tenant' and coalesce(c.is_active, false) then e.company_id end as company_id,
      (p.license_status <> 'suspended' and (p.license_expires_at is null or p.license_expires_at > now())
        and (o.id is null or (o.license_status <> 'suspended' and (o.license_expires_at is null or o.license_expires_at > now()))))
        as license_ok
    from public.engineers e
    join public.property_roles pr on pr.id = e.property_role_id
    join public.properties p on p.id = e.property_id
    left join public.organizations o on o.id = p.organization_id
    left join public.tenant_companies c on c.id = e.company_id
    where e.user_id is not null and e.is_active
    order by e.property_id, pr.name
    limit 300
  loop
    v_failed := array[]::text[];
    v_view := pg_temp.grant_scope(m.role_id, 'workRequest.view');
    v_maintenance := pg_temp.grant_scope(m.role_id, 'maintenance.view');
    v_members := pg_temp.grant_scope(m.role_id, 'members.view');
    v_audit := pg_temp.grant_scope(m.role_id, 'audit.view');

    -- Work orders the member should see, counted as the superuser
    select count(*) into v_total
    from public.work_orders w
    where w.property_id = m.property_id
      and m.license_ok
      and (
        v_view = 'property'
        or (v_view = 'assigned' and w.engineer_id = m.engineer_id)
        or (v_view = 'company' and m.company_id is not null and w.company_id = m.company_id)
      );

    perform set_config(
      'request.jwt.claims',
      jsonb_build_object(
        'sub', m.user_id,
        'role', 'authenticated',
        'app_metadata', jsonb_build_object('property_id', m.property_id, 'property_ids', jsonb_build_array(m.property_id))
      )::text,
      true
    );
    execute 'set local role authenticated';

    -- Nothing from other properties
    select count(*) into v_bad from public.work_orders where property_id <> m.property_id;
    if v_bad > 0 then v_failed := v_failed || format('other-property work orders visible: %s', v_bad); end if;
    select count(*) into v_bad from public.engineers where property_id <> m.property_id and user_id is distinct from m.user_id;
    if v_bad > 0 then v_failed := v_failed || format('other-property members visible: %s', v_bad); end if;
    select count(*) into v_bad from public.tenant_companies where property_id <> m.property_id;
    if v_bad > 0 then v_failed := v_failed || format('other-property companies visible: %s', v_bad); end if;
    select count(*) into v_bad from public.floors where property_id <> m.property_id;
    if v_bad > 0 then v_failed := v_failed || format('other-property floors visible: %s', v_bad); end if;
    select count(*) into v_bad from public.property_roles where property_id <> m.property_id;
    if v_bad > 0 then v_failed := v_failed || format('other-property roles visible: %s', v_bad); end if;
    select count(*) into v_bad from public.invitations;
    if v_bad > 0 then v_failed := v_failed || format('invitations visible: %s', v_bad); end if;
    select count(*) into v_bad from public.organization_invitations;
    if v_bad > 0 then v_failed := v_failed || format('organization invitations visible: %s', v_bad); end if;
    -- Property claims alone reach no organization rows (Org Admins are checked below with org_ids)
    select count(*) into v_bad from public.organizations;
    if v_bad > 0 then v_failed := v_failed || format('organizations visible without org_ids: %s', v_bad); end if;
    select count(*) into v_bad from public.organization_members where user_id is distinct from m.user_id;
    if v_bad > 0 then v_failed := v_failed || format('other org members visible without org_ids: %s', v_bad); end if;

    -- Work orders follow workRequest.view
    select count(*) into v_visible from public.work_orders;
    if v_visible <> v_total then
      v_failed := v_failed || format('sees %s work orders, expected %s (workRequest.view: %s, license ok: %s)',
        v_visible, v_total, coalesce(v_view, 'none'), m.license_ok);
    end if;
    if v_view = 'assigned' then
      select count(*) into v_bad from public.work_orders where engineer_id is distinct from m.engineer_id;
      if v_bad > 0 then v_failed := v_failed || format('unassigned work orders visible: %s', v_bad); end if;
    elsif v_view = 'company' then
      select count(*) into v_bad from public.work_orders where company_id is distinct from m.company_id;
      if v_bad > 0 then v_failed := v_failed || format('work orders of other companies visible: %s', v_bad); end if;
    end if;

    -- Maintenance data, audit log and members follow their permissions
    if not (m.license_ok and v_maintenance = 'property') then
      select count(*) into v_bad from public.sites;
      if v_bad > 0 then v_failed := v_failed || format('maintenance data (sites) visible without maintenance.view: %s', v_bad); end if;
    end if;
    if not (m.license_ok and v_audit = 'property') then
      select count(*) into v_bad from public.audit_log;
      if v_bad > 0 then v_failed := v_failed || format('audit log visible without audit.view: %s', v_bad); end if;
    end if;
    if not (m.license_ok and v_members = 'property') then
      select count(*) into v_bad from public.engineers where user_id is distinct from m.user_id;
      if v_bad > 0 then v_failed := v_failed || format('other members visible without members.view: %s', v_bad); end if;
    end if;

    -- No Data API writes
    begin
      execute 'update public.work_orders set notes = notes where false';
      v_failed := v_failed || 'update on work_orders allowed'::text;
    exception when insufficient_privilege then
      null; -- expected
    end;
    begin
      execute 'insert into public.audit_log (action) values (''rls-check'')';
      v_failed := v_failed || 'insert on audit_log allowed'::text;
    exception when insufficient_privilege then
      null; -- expected
    end;
    begin
      execute 'update public.property_roles set name = name where false';
      v_failed := v_failed || 'update on property_roles allowed'::text;
    exception when insufficient_privilege then
      null; -- expected
    end;

    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);

    insert into rls_check_failures
    select m.email, m.property_id, m.role_name, 'member visibility', failure from unnest(v_failed) as failure;
  end loop;

  -- Org Admins: the claims carry only org_ids (no property_ids)
  for m in
    select
      om.user_id,
      om.email,
      om.organization_id,
      (o.license_status <> 'suspended' and (o.license_expires_at is null or o.license_expires_at > now())) as license_ok
    from public.organization_members om
    join public.organizations o on o.id = om.organization_id
    where om.is_active
    order by om.organization_id
    limit 100
  loop
    -- Work orders of the organization's properties whose own license is usable
    select count(*) into v_total
    from public.work_orders w
    join public.properties p on p.id = w.property_id
    where p.organization_id = m.organization_id
      and p.license_status <> 'suspended'
      and (p.license_expires_at is null or p.license_expires_at > now());
    v_failed := array[]::text[];

    perform set_config(
      'request.jwt.claims',
      jsonb_build_object(
        'sub', m.user_id,
        'role', 'authenticated',
        'app_metadata', jsonb_build_object('org_ids', jsonb_build_array(m.organization_id))
      )::text,
      true
    );
    execute 'set local role authenticated';

    select count(*) into v_bad from public.organizations where id <> m.organization_id;
    if v_bad > 0 then v_failed := v_failed || format('other organizations visible: %s', v_bad); end if;
    select count(*) into v_bad
    from public.organization_members
    where organization_id <> m.organization_id and user_id is distinct from m.user_id;
    if v_bad > 0 then v_failed := v_failed || format('members of other organizations visible: %s', v_bad); end if;
    select count(*) into v_bad from public.organization_invitations;
    if v_bad > 0 then v_failed := v_failed || format('organization invitations visible: %s', v_bad); end if;
    select count(*) into v_bad
    from public.work_orders w
    where w.property_id not in (select p.id from public.properties p where p.organization_id = m.organization_id);
    if v_bad > 0 then v_failed := v_failed || format('work orders of other organizations visible: %s', v_bad); end if;

    select count(*) into v_visible from public.organizations where id = m.organization_id;
    if m.license_ok and v_visible <> 1 then v_failed := v_failed || 'own organization not visible'::text; end if;
    if not m.license_ok and v_visible > 0 then v_failed := v_failed || 'license blocked but organization visible'::text; end if;

    select count(*) into v_visible from public.work_orders;
    if m.license_ok and v_visible <> v_total then
      v_failed := v_failed || format('org admin sees %s of %s work orders (missing Administrator rows?)', v_visible, v_total);
    end if;
    if not m.license_ok and v_visible > 0 then
      v_failed := v_failed || format('organization license blocked but %s work orders visible', v_visible);
    end if;

    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);

    insert into rls_check_failures
    select m.email, null::uuid, 'org_admin', 'org admin visibility', failure from unnest(v_failed) as failure;
  end loop;
end $$;

select * from rls_check_failures order by property_id, role, member_email;

rollback;
