-- ============================================================
-- Migration 019: Security hotfix (Phase 0 of the 3-portal rewrite)
--
-- Run manually in the Supabase SQL Editor AFTER 018_work_order_form.sql
-- (staging first). Safe to re-run.
--
-- Background: every application write goes through Next.js route handlers that
-- use the service role (RLS bypassed) after an app-layer authorization check.
-- The browser never writes to these tables directly, so the permissive
-- INSERT/UPDATE/DELETE policies below only gave anyone holding the public anon
-- key (plus a session) a way around those checks.
--
-- This migration:
--   1. Removes every write policy for anon/authenticated on application tables.
--   2. Removes read access granted by token *presence* (`sign_off_token is not null`,
--      `costing_token is not null`): token pages and routes use the service role.
--   3. Removes the public "read any invitation" policy (exposed invite tokens).
--   4. Scopes buildings / assets / ppm_schedules / checklist_items / parts_used reads
--      to the caller's active property (they were readable by every signed-in user).
--   5. Removes bucket-wide storage listing/upload policies. Public object URLs keep
--      working until buckets are made private in a later migration.
--   6. Gives pending provider-created invitations the 'admin' role explicitly
--      (invitations without a role are now rejected instead of defaulting to admin).
-- ============================================================

-- ── 1. Drop write policies (all writes use the service role) ─────────────────

drop policy if exists "Provider insert properties"            on properties;
drop policy if exists "Provider update properties"            on properties;
drop policy if exists "Property-scoped insert sites"          on sites;
drop policy if exists "Property-scoped update sites"          on sites;
drop policy if exists "Authenticated insert buildings"        on buildings;
drop policy if exists "Authenticated update buildings"        on buildings;
drop policy if exists "Authenticated insert assets"           on assets;
drop policy if exists "Authenticated update assets"           on assets;
drop policy if exists "Property-scoped insert engineers"      on engineers;
drop policy if exists "Property-scoped update engineers"      on engineers;
drop policy if exists "Authenticated insert ppm_schedules"    on ppm_schedules;
drop policy if exists "Authenticated update ppm_schedules"    on ppm_schedules;
drop policy if exists "Property-scoped insert work_orders"    on work_orders;
drop policy if exists "Property-scoped update work_orders"    on work_orders;
drop policy if exists "Authenticated insert checklist_items"  on checklist_items;
drop policy if exists "Authenticated update checklist_items"  on checklist_items;
drop policy if exists "Authenticated delete checklist_items"  on checklist_items;
drop policy if exists "Property-scoped insert inventory"      on inventory_items;
drop policy if exists "Property-scoped update inventory"      on inventory_items;
drop policy if exists "Authenticated insert parts_used"       on parts_used;
drop policy if exists "Authenticated insert audit_log"        on audit_log;
drop policy if exists "Provider manage invitations"           on invitations;
drop policy if exists "Authenticated insert work_order_reports"   on work_order_reports;
drop policy if exists "Authenticated update work_order_reports"   on work_order_reports;
drop policy if exists "Authenticated insert work_order_costings"  on work_order_costings;
drop policy if exists "Authenticated update work_order_costings"  on work_order_costings;
drop policy if exists "Authenticated insert completion_evidence"  on work_order_completion_evidence;
drop policy if exists "Public insert service_ratings"         on service_ratings;
drop policy if exists "Public insert approval_trail"          on approval_trail;
drop policy if exists "Property-scoped insert wo_comments"    on work_order_comments;
drop policy if exists "Service can insert notifications"      on notifications;
drop policy if exists "Own notifications update"              on notifications;
drop policy if exists "Service insert work_order_events"      on work_order_events;

-- ── 2. Read policies without token-presence clauses ──────────────────────────

drop policy if exists "Property-scoped read work_orders" on work_orders;
create policy "Property-scoped read work_orders" on work_orders
  for select to authenticated
  using (
    property_id = (((select auth.jwt()) -> 'app_metadata' ->> 'property_id')::uuid)
    or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'provider'
  );

drop policy if exists "Property-scoped read work_order_reports" on work_order_reports;
create policy "Property-scoped read work_order_reports" on work_order_reports
  for select to authenticated
  using (
    work_order_id in (
      select id from work_orders
      where property_id = (((select auth.jwt()) -> 'app_metadata' ->> 'property_id')::uuid)
         or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'provider'
    )
  );

drop policy if exists "Property-scoped read work_order_costings" on work_order_costings;
create policy "Property-scoped read work_order_costings" on work_order_costings
  for select to authenticated
  using (
    work_order_id in (
      select id from work_orders
      where property_id = (((select auth.jwt()) -> 'app_metadata' ->> 'property_id')::uuid)
         or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'provider'
    )
  );

drop policy if exists "Property-scoped read completion_evidence" on work_order_completion_evidence;
create policy "Property-scoped read completion_evidence" on work_order_completion_evidence
  for select to authenticated
  using (
    work_order_id in (
      select id from work_orders
      where property_id = (((select auth.jwt()) -> 'app_metadata' ->> 'property_id')::uuid)
         or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'provider'
    )
  );

-- ── 3. Invitations are only read by server code (service role) ───────────────

drop policy if exists "Public read invitation by token" on invitations;

-- ── 4. Property-scoped reads for maintenance tables ──────────────────────────

drop policy if exists "Authenticated read buildings" on buildings;
create policy "Property-scoped read buildings" on buildings
  for select to authenticated
  using (
    site_id in (
      select id from sites
      where property_id = (((select auth.jwt()) -> 'app_metadata' ->> 'property_id')::uuid)
    )
    or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'provider'
  );

drop policy if exists "Authenticated read assets" on assets;
create policy "Property-scoped read assets" on assets
  for select to authenticated
  using (
    building_id in (
      select b.id from buildings b
      join sites s on s.id = b.site_id
      where s.property_id = (((select auth.jwt()) -> 'app_metadata' ->> 'property_id')::uuid)
    )
    or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'provider'
  );

drop policy if exists "Authenticated read ppm_schedules" on ppm_schedules;
create policy "Property-scoped read ppm_schedules" on ppm_schedules
  for select to authenticated
  using (
    asset_id in (
      select a.id from assets a
      join buildings b on b.id = a.building_id
      join sites s on s.id = b.site_id
      where s.property_id = (((select auth.jwt()) -> 'app_metadata' ->> 'property_id')::uuid)
    )
    or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'provider'
  );

drop policy if exists "Authenticated read checklist_items" on checklist_items;
create policy "Property-scoped read checklist_items" on checklist_items
  for select to authenticated
  using (
    work_order_id in (
      select id from work_orders
      where property_id = (((select auth.jwt()) -> 'app_metadata' ->> 'property_id')::uuid)
         or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'provider'
    )
  );

drop policy if exists "Authenticated read parts_used" on parts_used;
create policy "Property-scoped read parts_used" on parts_used
  for select to authenticated
  using (
    work_order_id in (
      select id from work_orders
      where property_id = (((select auth.jwt()) -> 'app_metadata' ->> 'property_id')::uuid)
         or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'provider'
    )
  );

-- Role catalog (role names only) stays readable to signed-in users; replaces auth.role()
drop policy if exists "Authenticated read roles" on roles;
create policy "Signed-in read roles" on roles
  for select to authenticated
  using ((select auth.uid()) is not null);

-- ── 5. Storage: no bucket-wide listing or uploads from the browser ───────────

drop policy if exists "Authenticated users can upload evidence" on storage.objects;
drop policy if exists "Evidence files are publicly readable"    on storage.objects;
drop policy if exists "Receipts files are publicly readable"    on storage.objects;

-- ── 6. Provider-created pending invitations are for Administrators ───────────

update invitations
set role_name = 'admin'
where role_name is null
  and invited_by is null
  and used_at is null;

-- ── Report anything that still lets the browser write ────────────────────────

do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname, cmd, roles
    from pg_policies
    where schemaname in ('public', 'storage')
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and not (roles = array['service_role']::name[])
  loop
    raise notice 'Remaining write policy: %.% "%" (%) roles=%',
      p.schemaname, p.tablename, p.policyname, p.cmd, p.roles;
  end loop;
end $$;
