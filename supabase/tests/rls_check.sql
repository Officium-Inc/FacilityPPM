-- supabase/tests/rls_check.sql
-- Verifies the role-aware RLS from migration 022 against the data in this database (run on staging first).
-- Paste into the Supabase SQL Editor and run. It changes nothing: everything happens in a transaction that
-- is rolled back. The result lists one row per failed check; an empty result means every check passed.
--
-- For each active member (up to 300) it impersonates that user (role `authenticated` with JWT claims that
-- only include that property) and checks what they can read:
--   * nobody sees work orders, members (other than their own rows), companies or floors of another property
--   * tenants see only their company's work orders, no maintenance data, no audit log, no other members
--   * Service Group members see only work orders assigned to them, no maintenance data, no audit log
--   * Head Engineers do not see the audit log
--   * staff (Administrator, Property Manager, Head Engineer) see every work order of an active property
--   * no signed-in user can write through the Data API
-- It also checks that `anon` reads nothing and that invitations are never readable.

begin;

create temp table rls_check_failures (
  member_email text,
  property_id uuid,
  role text,
  check_name text,
  detail text
);

do $$
declare
  m record;
  v_total bigint;
  v_visible bigint;
  v_bad bigint;
  v_failed text[];
  v_license_ok boolean;
  v_tables text[] := array[
    'properties', 'sites', 'buildings', 'assets', 'roles', 'engineers', 'ppm_schedules', 'work_orders',
    'checklist_items', 'inventory_items', 'parts_used', 'audit_log', 'invitations', 'work_order_reports',
    'work_order_costings', 'work_order_completion_evidence', 'service_ratings', 'approval_trail',
    'work_order_comments', 'notifications', 'property_monday_integrations', 'work_order_events',
    'floors', 'tenant_companies', 'floor_occupancies'
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
      case when coalesce(c.is_active, false) then e.company_id end as company_id,
      -- Same canonical role as private.my_memberships() (migration 022)
      case regexp_replace(lower(trim(r.name)), '[[:space:]_-]+', '_', 'g')
        when 'administrator' then 'admin'
        when 'engineer' then 'head_engineer'
        else regexp_replace(lower(trim(r.name)), '[[:space:]_-]+', '_', 'g')
      end as role,
      (p.license_status <> 'suspended' and (p.license_expires_at is null or p.license_expires_at > now())) as license_ok
    from public.engineers e
    join public.roles r on r.id = e.role_id
    join public.properties p on p.id = e.property_id
    left join public.tenant_companies c on c.id = e.company_id
    where e.user_id is not null and e.is_active
    order by e.property_id, r.name
    limit 300
  loop
    select count(*) into v_total from public.work_orders where property_id = m.property_id;
    v_failed := array[]::text[];

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
    select count(*) into v_bad from public.invitations;
    if v_bad > 0 then v_failed := v_failed || format('invitations visible: %s', v_bad); end if;

    if m.role = 'tenant' then
      select count(*) into v_bad from public.work_orders where company_id is distinct from m.company_id;
      if v_bad > 0 then v_failed := v_failed || format('work orders of other companies visible: %s', v_bad); end if;
      select count(*) into v_bad from public.engineers where user_id is distinct from m.user_id;
      if v_bad > 0 then v_failed := v_failed || format('other members visible: %s', v_bad); end if;
      select count(*) into v_bad from public.sites;
      if v_bad > 0 then v_failed := v_failed || format('maintenance data (sites) visible: %s', v_bad); end if;
      select count(*) into v_bad from public.audit_log;
      if v_bad > 0 then v_failed := v_failed || format('audit log visible: %s', v_bad); end if;
    elsif m.role = 'service_group' then
      select count(*) into v_bad from public.work_orders where engineer_id is distinct from m.engineer_id;
      if v_bad > 0 then v_failed := v_failed || format('unassigned work orders visible: %s', v_bad); end if;
      select count(*) into v_bad from public.engineers where user_id is distinct from m.user_id;
      if v_bad > 0 then v_failed := v_failed || format('other members visible: %s', v_bad); end if;
      select count(*) into v_bad from public.sites;
      if v_bad > 0 then v_failed := v_failed || format('maintenance data (sites) visible: %s', v_bad); end if;
      select count(*) into v_bad from public.audit_log;
      if v_bad > 0 then v_failed := v_failed || format('audit log visible: %s', v_bad); end if;
    elsif m.role in ('admin', 'property_manager', 'head_engineer') then
      select count(*) into v_visible from public.work_orders;
      if m.license_ok and v_visible <> v_total then
        v_failed := v_failed || format('staff see %s of %s work orders', v_visible, v_total);
      end if;
      if not m.license_ok and v_visible > 0 then
        v_failed := v_failed || format('license blocked but %s work orders visible', v_visible);
      end if;
      if m.role = 'head_engineer' then
        select count(*) into v_bad from public.audit_log;
        if v_bad > 0 then v_failed := v_failed || format('audit log visible to head engineer: %s', v_bad); end if;
      end if;
    else
      -- Retired or unknown roles (viewer): no work orders at all
      select count(*) into v_bad from public.work_orders;
      if v_bad > 0 then v_failed := v_failed || format('retired role sees %s work orders', v_bad); end if;
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

    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);

    insert into rls_check_failures
    select m.email, m.property_id, m.role, 'member visibility', failure from unnest(v_failed) as failure;
  end loop;
end $$;

select * from rls_check_failures order by property_id, role, member_email;

rollback;
