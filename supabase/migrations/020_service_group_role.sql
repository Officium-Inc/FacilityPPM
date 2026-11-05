-- ============================================================
-- Migration 020: Canonical 'service_group' role name (Phase 1)
--
-- Run manually in the Supabase SQL Editor AFTER 019_security_hotfix.sql.
-- Safe to re-run. The application accepts both names, so this can run
-- before or after deploying the Phase 1 code.
--
-- Role names were snake_case except 'service group'. This renames it, or merges
-- members into an existing 'service_group' row when both exist.
-- ============================================================

do $$
declare
  legacy_id uuid;
  canonical_id uuid;
begin
  select id into legacy_id from roles where name = 'service group';
  select id into canonical_id from roles where name = 'service_group';

  if legacy_id is not null and canonical_id is null then
    update roles set name = 'service_group' where id = legacy_id;
  elsif legacy_id is not null and canonical_id is not null then
    update engineers set role_id = canonical_id where role_id = legacy_id;
    delete from roles where id = legacy_id;
  elsif canonical_id is null then
    insert into roles (name) values ('service_group');
  end if;
end $$;

update invitations
set role_name = 'service_group'
where lower(trim(replace(replace(role_name, '_', ' '), '-', ' '))) = 'service group';

-- Event log and comments store the role as text for display; keep them consistent
update work_order_comments set author_role = 'service_group' where author_role = 'service group';
update work_order_events   set actor_role  = 'service_group' where actor_role  = 'service group';
