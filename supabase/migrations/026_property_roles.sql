-- 026_property_roles.sql
-- Custom roles per property (D32) with a work type (D33).
--
--   permission_keys            catalog mirror of lib/authz/catalog.ts (block CATALOG:BEGIN/END)
--   property_roles             roles of a property: portal (staff | tenant), work type (none | engineer |
--                              service_group), system_key for the 5 defaults, is_locked for Administrator
--   property_role_permissions  grants: role → permission key + scope (the Administrator role has none: it is
--                              computed as every staff key at property scope)
--   engineers.property_role_id / invitations.property_role_id   the member's / invited role
--   properties.roles_seeded_at  defaults are seeded once per property (a deleted default never comes back)
--
-- Every property gets the 5 default roles with today's permissions (lib/authz/templates.ts, block
-- TEMPLATES:BEGIN/END) and a permanent trigger seeds new properties. Members and pending invitations are mapped
-- from their global role name. Sync triggers keep engineers.role_id / invitations.role_name and the new columns
-- in step while older app versions still write the old columns (dropped by 031).
--
-- Read policies for the new tables are in 027_permission_rls.sql. Run 026 and 027 BEFORE deploying the app
-- that uses property roles. Safe to re-run.

-- ── Preconditions ──────────────────────────────────────────────────────────

do $$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'Migration 025_organizations.sql has not been applied. Apply it, then re-run 026.';
  end if;
end $$;

-- ── Permission catalog ─────────────────────────────────────────────────────

create table if not exists permission_keys (
  key       text primary key,
  module    text not null,
  label     text not null,
  portals   text[] not null,
  scopes    text[] not null,
  position  integer not null default 0
);

alter table permission_keys enable row level security;

insert into permission_keys (key, module, label, portals, scopes, position) values
-- CATALOG:BEGIN
  ('workRequest.view', 'work_requests', 'View work requests', '{staff,tenant}', '{property,assigned,company}', 10),
  ('workRequest.submit', 'work_requests', 'Submit requests', '{tenant}', '{company}', 20),
  ('workRequest.submitOnBehalf', 'work_requests', 'Report on behalf of a tenant', '{staff}', '{property}', 30),
  ('workRequest.review', 'work_requests', 'Review, cost and verify', '{staff}', '{property}', 40),
  ('workRequest.inspect', 'work_requests', 'Record inspections', '{staff}', '{property,assigned}', 50),
  ('workRequest.assign', 'work_requests', 'Assign work', '{staff}', '{property}', 60),
  ('workRequest.execute', 'work_requests', 'Do the work', '{staff}', '{property,assigned}', 70),
  ('workRequest.cancel', 'work_requests', 'Cancel requests', '{staff,tenant}', '{property,company}', 80),
  ('workRequest.approve', 'work_requests', 'Approve estimates and sign off', '{tenant}', '{company}', 90),
  ('workRequest.comment', 'work_requests', 'Comment', '{staff,tenant}', '{property,assigned,company}', 100),
  ('workRequest.waivedList', 'work_requests', 'View waived orders', '{staff}', '{property}', 110),
  ('workRequest.waive', 'work_requests', 'Waive charges', '{staff}', '{property}', 120),
  ('floors.view', 'structure', 'View floors & tenants', '{staff}', '{property}', 200),
  ('floors.manage', 'structure', 'Manage floors', '{staff}', '{property}', 210),
  ('companies.manage', 'structure', 'Manage tenant companies', '{staff}', '{property}', 220),
  ('maintenance.view', 'maintenance', 'View maintenance', '{staff}', '{property}', 300),
  ('maintenance.manage', 'maintenance', 'Manage maintenance', '{staff}', '{property}', 310),
  ('members.view', 'people', 'View members', '{staff}', '{property}', 400),
  ('members.manage', 'people', 'Manage members', '{staff}', '{property}', 410),
  ('roles.manage', 'people', 'Manage roles', '{staff}', '{property}', 420),
  ('audit.view', 'people', 'View audit log', '{staff}', '{property}', 430),
  ('property.profile.edit', 'property', 'Edit property profile', '{staff}', '{property}', 500),
  ('property.integrations.manage', 'property', 'Manage integrations', '{staff}', '{property}', 510)
-- CATALOG:END
on conflict (key) do update
  set module = excluded.module,
      label = excluded.label,
      portals = excluded.portals,
      scopes = excluded.scopes,
      position = excluded.position;

-- ── Property roles ─────────────────────────────────────────────────────────

create table if not exists property_roles (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references properties(id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 60),
  description  text check (description is null or length(description) <= 300),
  portal       text not null check (portal in ('staff', 'tenant')),
  work_type    text not null default 'none' check (work_type in ('none', 'engineer', 'service_group')),
  system_key   text check (system_key in ('admin', 'property_manager', 'head_engineer', 'service_group', 'tenant')),
  is_locked    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, property_id),
  -- Tenant roles never do field work; only the Administrator system role is locked (and it is staff)
  constraint property_roles_tenant_work_type check (portal = 'staff' or work_type = 'none'),
  constraint property_roles_locked_admin check (is_locked = coalesce(system_key = 'admin', false)),
  constraint property_roles_admin_staff check (system_key is distinct from 'admin' or portal = 'staff')
);

create unique index if not exists property_roles_name_key on property_roles (property_id, lower(trim(name)));
create unique index if not exists property_roles_system_key_key on property_roles (property_id, system_key) where system_key is not null;

alter table property_roles enable row level security;

create table if not exists property_role_permissions (
  role_id         uuid not null,
  property_id     uuid not null,
  permission_key  text not null references permission_keys(key) on update cascade on delete cascade,
  scope           text not null check (scope in ('property', 'assigned', 'company')),
  primary key (role_id, permission_key),
  foreign key (role_id, property_id) references property_roles (id, property_id) on delete cascade
);

create index if not exists idx_property_role_permissions_property on property_role_permissions (property_id);

alter table property_role_permissions enable row level security;

-- No Data API writes (D25); reads are granted by policies in 027
revoke all on permission_keys, property_roles, property_role_permissions from anon;
revoke insert, update, delete, truncate, references, trigger
  on permission_keys, property_roles, property_role_permissions from authenticated;

-- ── Members, invitations and properties reference property roles ───────────

alter table properties  add column if not exists roles_seeded_at timestamptz;
alter table engineers   add column if not exists property_role_id uuid;
alter table invitations add column if not exists property_role_id uuid;

do $$
begin
  -- NO ACTION (not RESTRICT): deleting a property cascades to its members and roles in one statement
  if not exists (select 1 from pg_constraint where conname = 'engineers_property_role_same_property_fkey') then
    alter table engineers
      add constraint engineers_property_role_same_property_fkey
      foreign key (property_role_id, property_id) references property_roles (id, property_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'invitations_property_role_same_property_fkey') then
    alter table invitations
      add constraint invitations_property_role_same_property_fkey
      foreign key (property_role_id, property_id) references property_roles (id, property_id);
  end if;
end $$;

create index if not exists idx_engineers_property_role on engineers (property_role_id) where property_role_id is not null;
create index if not exists idx_invitations_property_role on invitations (property_role_id) where property_role_id is not null;

-- ── Grant validation ───────────────────────────────────────────────────────

create schema if not exists private;

-- A grant must fit its key (portal and scope) and the role's portal; the Administrator role holds no stored grants
create or replace function private.check_role_permission()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  role_row record;
  key_row record;
begin
  select r.portal, r.is_locked into role_row
  from public.property_roles r
  where r.id = new.role_id and r.property_id = new.property_id;
  if not found then
    raise exception 'Role % does not belong to property %.', new.role_id, new.property_id;
  end if;
  if role_row.is_locked then
    raise exception 'The Administrator role''s permissions are fixed.';
  end if;

  select k.portals, k.scopes into key_row from public.permission_keys k where k.key = new.permission_key;
  if not (role_row.portal = any (key_row.portals)) then
    raise exception 'Permission % is not available to % roles.', new.permission_key, role_row.portal;
  end if;
  if not (new.scope = any (key_row.scopes))
     or (role_row.portal = 'staff' and new.scope not in ('property', 'assigned'))
     or (role_row.portal = 'tenant' and new.scope <> 'company') then
    raise exception 'Scope % is not allowed for % on a % role.', new.scope, new.permission_key, role_row.portal;
  end if;
  return new;
end $$;

revoke all on function private.check_role_permission() from public, anon, authenticated;

drop trigger if exists property_role_permissions_check on property_role_permissions;
create trigger property_role_permissions_check
  before insert or update on property_role_permissions
  for each row execute function private.check_role_permission();

-- A role's portal is chosen at creation and never changes; system roles keep their key and lock
create or replace function private.protect_property_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.portal is distinct from old.portal then
    raise exception 'A role''s portal cannot be changed.';
  end if;
  if new.system_key is distinct from old.system_key or new.is_locked is distinct from old.is_locked then
    raise exception 'A role''s system key and lock cannot be changed.';
  end if;
  if old.is_locked and new.work_type is distinct from old.work_type then
    raise exception 'The Administrator role cannot be changed.';
  end if;
  return new;
end $$;

revoke all on function private.protect_property_role() from public, anon, authenticated;

drop trigger if exists property_roles_protect on property_roles;
create trigger property_roles_protect
  before update on property_roles
  for each row execute function private.protect_property_role();

-- ── Default roles ──────────────────────────────────────────────────────────

-- Global role name → system key; same normalization as lib/roles.ts (unknown and retired names → null)
create or replace function private.system_key_for_role_name(role_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case regexp_replace(lower(trim(coalesce(role_name, ''))), '[[:space:]_-]+', '_', 'g')
    when 'admin' then 'admin'
    when 'administrator' then 'admin'
    when 'property_manager' then 'property_manager'
    when 'head_engineer' then 'head_engineer'
    when 'engineer' then 'head_engineer'
    when 'service_group' then 'service_group'
    when 'tenant' then 'tenant'
    else null
  end
$$;

-- Seeds the 5 default roles of a property once (properties.roles_seeded_at)
create or replace function private.seed_property_roles(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.properties p where p.id = target and p.roles_seeded_at is null) then
    return;
  end if;

  insert into public.property_roles (property_id, name, description, portal, work_type, system_key, is_locked)
  values
    (target, 'Administrator', 'Full access to the property. Cannot be edited or deleted.', 'staff', 'none', 'admin', true),
    (target, 'Property Manager', 'Runs the building: members, tenant companies, settings and every work request.', 'staff', 'none', 'property_manager', false),
    (target, 'Head Engineer', 'Leads the maintenance work: reviews, inspects, assigns and verifies.', 'staff', 'engineer', 'head_engineer', false),
    (target, 'Service Group', 'Manpower assigned to inspect and fix requests. Sees only work assigned to them.', 'staff', 'service_group', 'service_group', false),
    (target, 'Tenant', 'A member of a tenant company: submits and follows the company’s requests.', 'tenant', 'none', 'tenant', false)
  on conflict do nothing;

  insert into public.property_role_permissions (role_id, property_id, permission_key, scope)
  select r.id, r.property_id, t.permission_key, t.scope
  from public.property_roles r
  join (values
-- TEMPLATES:BEGIN
    ('property_manager', 'property.profile.edit', 'property'),
    ('property_manager', 'property.integrations.manage', 'property'),
    ('property_manager', 'floors.view', 'property'),
    ('property_manager', 'companies.manage', 'property'),
    ('property_manager', 'members.view', 'property'),
    ('property_manager', 'members.manage', 'property'),
    ('property_manager', 'audit.view', 'property'),
    ('property_manager', 'maintenance.view', 'property'),
    ('property_manager', 'maintenance.manage', 'property'),
    ('property_manager', 'workRequest.view', 'property'),
    ('property_manager', 'workRequest.submitOnBehalf', 'property'),
    ('property_manager', 'workRequest.review', 'property'),
    ('property_manager', 'workRequest.inspect', 'property'),
    ('property_manager', 'workRequest.assign', 'property'),
    ('property_manager', 'workRequest.execute', 'property'),
    ('property_manager', 'workRequest.cancel', 'property'),
    ('property_manager', 'workRequest.waive', 'property'),
    ('property_manager', 'workRequest.waivedList', 'property'),
    ('property_manager', 'workRequest.comment', 'property'),
    ('head_engineer', 'floors.view', 'property'),
    ('head_engineer', 'members.view', 'property'),
    ('head_engineer', 'maintenance.view', 'property'),
    ('head_engineer', 'maintenance.manage', 'property'),
    ('head_engineer', 'workRequest.view', 'property'),
    ('head_engineer', 'workRequest.submitOnBehalf', 'property'),
    ('head_engineer', 'workRequest.review', 'property'),
    ('head_engineer', 'workRequest.inspect', 'property'),
    ('head_engineer', 'workRequest.assign', 'property'),
    ('head_engineer', 'workRequest.execute', 'property'),
    ('head_engineer', 'workRequest.cancel', 'property'),
    ('head_engineer', 'workRequest.comment', 'property'),
    ('service_group', 'workRequest.view', 'assigned'),
    ('service_group', 'workRequest.inspect', 'assigned'),
    ('service_group', 'workRequest.execute', 'assigned'),
    ('service_group', 'workRequest.comment', 'assigned'),
    ('tenant', 'workRequest.view', 'company'),
    ('tenant', 'workRequest.submit', 'company'),
    ('tenant', 'workRequest.cancel', 'company'),
    ('tenant', 'workRequest.approve', 'company'),
    ('tenant', 'workRequest.comment', 'company')
-- TEMPLATES:END
  ) as t (system_key, permission_key, scope) on t.system_key = r.system_key
  where r.property_id = target
  on conflict do nothing;

  update public.properties set roles_seeded_at = now() where id = target;
end $$;

revoke all on function private.seed_property_roles(uuid) from public, anon, authenticated;
grant execute on function private.seed_property_roles(uuid) to service_role;

-- Permanent: every new property starts with the default roles
create or replace function private.seed_new_property_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_property_roles(new.id);
  return null;
end $$;

revoke all on function private.seed_new_property_roles() from public, anon, authenticated;

drop trigger if exists properties_seed_roles on properties;
create trigger properties_seed_roles
  after insert on properties
  for each row execute function private.seed_new_property_roles();

-- ── Mapping between the global roles and property roles ────────────────────

-- The property role for a global role id (null for retired/unknown names)
create or replace function private.property_role_for_role_id(target_property uuid, global_role uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select pr.id
  from public.roles r
  join public.property_roles pr
    on pr.property_id = target_property
   and pr.system_key = private.system_key_for_role_name(r.name)
  where r.id = global_role
$$;

-- The global role id of a property role (null for custom roles)
create or replace function private.role_id_for_property_role(property_role uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select r.id
  from public.property_roles pr
  join public.roles r on private.system_key_for_role_name(r.name) = pr.system_key
  where pr.id = property_role and pr.system_key is not null
  order by (r.name = pr.system_key) desc
  limit 1
$$;

-- The property role for an invitation's role name
create or replace function private.property_role_for_name(target_property uuid, role_name text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select pr.id
  from public.property_roles pr
  where pr.property_id = target_property
    and pr.system_key = private.system_key_for_role_name(role_name)
$$;

revoke all on function private.system_key_for_role_name(text) from public, anon, authenticated;
revoke all on function private.property_role_for_role_id(uuid, uuid) from public, anon, authenticated;
revoke all on function private.role_id_for_property_role(uuid) from public, anon, authenticated;
revoke all on function private.property_role_for_name(uuid, text) from public, anon, authenticated;

-- ── Backfill ───────────────────────────────────────────────────────────────

do $$
declare
  p record;
  seeded integer := 0;
begin
  for p in select id from public.properties where roles_seeded_at is null loop
    perform private.seed_property_roles(p.id);
    seeded := seeded + 1;
  end loop;
  if seeded > 0 then
    raise notice 'Seeded the default roles of % propert(y/ies).', seeded;
  end if;
end $$;

update public.engineers e
set property_role_id = private.property_role_for_role_id(e.property_id, e.role_id)
where e.property_role_id is null
  and e.role_id is not null
  and e.property_id is not null;

update public.invitations i
set property_role_id = private.property_role_for_name(i.property_id, i.role_name)
where i.property_role_id is null
  and i.role_name is not null;

do $$
declare
  unmapped_members integer;
  unmapped_invites integer;
begin
  select count(*) into unmapped_members
  from public.engineers
  where property_role_id is null and property_id is not null;
  select count(*) into unmapped_invites
  from public.invitations
  where property_role_id is null and used_at is null and expires_at > now();
  if unmapped_members > 0 then
    raise notice '% member(s) have no property role (retired viewer or no role): they have no access until an Administrator gives them a role.', unmapped_members;
  end if;
  if unmapped_invites > 0 then
    raise notice '% pending invitation(s) have no property role and cannot be accepted; send them again.', unmapped_invites;
  end if;
end $$;

-- ── Sync triggers (until 031 drops engineers.role_id) ──────────────────────
-- Older app versions write engineers.role_id / invitations.role_name; this app writes property_role_id.
-- Whichever side changed, the other follows.

create or replace function private.sync_engineer_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.property_role_id is null and new.role_id is not null then
      new.property_role_id := private.property_role_for_role_id(new.property_id, new.role_id);
    elsif new.property_role_id is not null then
      new.role_id := private.role_id_for_property_role(new.property_role_id);
    end if;
  elsif new.property_role_id is distinct from old.property_role_id then
    new.role_id := private.role_id_for_property_role(new.property_role_id);
  elsif new.role_id is distinct from old.role_id then
    new.property_role_id := private.property_role_for_role_id(new.property_id, new.role_id);
  end if;
  return new;
end $$;

revoke all on function private.sync_engineer_role() from public, anon, authenticated;

drop trigger if exists engineers_sync_role on engineers;
create trigger engineers_sync_role
  before insert or update of role_id, property_role_id on engineers
  for each row execute function private.sync_engineer_role();

create or replace function private.sync_invitation_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  role_row record;
begin
  if new.property_role_id is not null
     and (tg_op = 'INSERT' or new.property_role_id is distinct from old.property_role_id) then
    select pr.system_key, pr.name into role_row from public.property_roles pr where pr.id = new.property_role_id;
    new.role_name := coalesce(role_row.system_key, role_row.name);
  elsif new.property_role_id is null and new.role_name is not null then
    new.property_role_id := private.property_role_for_name(new.property_id, new.role_name);
  end if;
  return new;
end $$;

revoke all on function private.sync_invitation_role() from public, anon, authenticated;

drop trigger if exists invitations_sync_role on invitations;
create trigger invitations_sync_role
  before insert or update of role_name, property_role_id on invitations
  for each row execute function private.sync_invitation_role();
