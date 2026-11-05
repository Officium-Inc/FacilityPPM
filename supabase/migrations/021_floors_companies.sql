-- ============================================================
-- Migration 021: Floors, tenant companies and occupancy (Phase 2)
--
-- Run manually in the Supabase SQL Editor AFTER 020_service_group_role.sql,
-- and BEFORE deploying the Phase 2 application code (the code selects the new
-- columns). Safe to re-run.
--
--   floors              floors of a property (optionally tied to a building)
--   tenant_companies    the companies that lease floors
--   floor_occupancies   which company occupies which floor; at most one current
--                       company per floor, a company may occupy several floors
--   engineers.company_id      tenant members belong to one company
--   invitations.company_id    tenant invitations name the company
--   work_orders.company_id / floor_id   set server-side from the submitter
--   properties.license_expires_at       licenses can expire (D17)
--
-- Composite foreign keys (id, property_id) make it impossible to point a row at a
-- floor or company of another property.
--
-- Decision D19: existing tenant users are NOT linked to companies automatically.
-- Until an Administrator/Property Manager links them (Floors & Tenants), they see a
-- "not linked to a company" page in the Tenant Portal.
--
-- Decision D1: the 'viewer' role is retired; viewer members are deactivated.
--
-- The new tables have RLS enabled and no browser policies: they are only read and
-- written by server code with the service role.
-- ============================================================

-- ── Licenses ───────────────────────────────────────────────────────────────

alter table properties add column if not exists license_expires_at timestamptz;

-- ── Floors ─────────────────────────────────────────────────────────────────

create table if not exists floors (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references properties(id) on delete cascade,
  building_id  uuid references buildings(id) on delete set null,
  label        text not null check (length(trim(label)) between 1 and 60),
  level        integer,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  unique (property_id, label),
  unique (id, property_id)
);

create index if not exists idx_floors_property on floors (property_id, sort_order);
create index if not exists idx_floors_building on floors (building_id);

alter table floors enable row level security;

-- ── Tenant companies ───────────────────────────────────────────────────────

create table if not exists tenant_companies (
  id             uuid primary key default gen_random_uuid(),
  property_id    uuid not null references properties(id) on delete cascade,
  name           text not null check (length(trim(name)) between 1 and 120),
  contact_name   text,
  contact_email  text,
  contact_phone  text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (property_id, name),
  unique (id, property_id)
);

create index if not exists idx_tenant_companies_property on tenant_companies (property_id);

alter table tenant_companies enable row level security;

-- ── Floor occupancy ────────────────────────────────────────────────────────

create table if not exists floor_occupancies (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references properties(id) on delete cascade,
  floor_id     uuid not null,
  company_id   uuid not null,
  starts_on    date not null default current_date,
  ends_on      date,
  created_at   timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on),
  foreign key (floor_id, property_id) references floors (id, property_id) on delete cascade,
  foreign key (company_id, property_id) references tenant_companies (id, property_id) on delete cascade
);

-- One current company per floor
create unique index if not exists floor_occupancies_one_current
  on floor_occupancies (floor_id) where ends_on is null;
create index if not exists idx_floor_occupancies_company
  on floor_occupancies (company_id) where ends_on is null;
create index if not exists idx_floor_occupancies_property on floor_occupancies (property_id);

alter table floor_occupancies enable row level security;

-- ── Members, invitations and work orders reference companies/floors ────────

alter table engineers   add column if not exists company_id uuid;
alter table invitations add column if not exists company_id uuid;
alter table work_orders add column if not exists company_id uuid;
alter table work_orders add column if not exists floor_id   uuid;

-- Composite FKs: on Postgres 15+ only the reference column is nulled when the company/floor is deleted.
-- Older servers fall back to NO ACTION (delete is refused while rows still reference it).
do $$
declare
  set_null_company text := case when current_setting('server_version_num')::int >= 150000
    then 'on delete set null (company_id)' else '' end;
  set_null_floor text := case when current_setting('server_version_num')::int >= 150000
    then 'on delete set null (floor_id)' else '' end;
begin
  if not exists (select 1 from pg_constraint where conname = 'engineers_company_same_property_fkey') then
    execute 'alter table engineers add constraint engineers_company_same_property_fkey '
      || 'foreign key (company_id, property_id) references tenant_companies (id, property_id) ' || set_null_company;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'invitations_company_same_property_fkey') then
    alter table invitations
      add constraint invitations_company_same_property_fkey
      foreign key (company_id, property_id) references tenant_companies (id, property_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'work_orders_company_same_property_fkey') then
    execute 'alter table work_orders add constraint work_orders_company_same_property_fkey '
      || 'foreign key (company_id, property_id) references tenant_companies (id, property_id) ' || set_null_company;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'work_orders_floor_same_property_fkey') then
    execute 'alter table work_orders add constraint work_orders_floor_same_property_fkey '
      || 'foreign key (floor_id, property_id) references floors (id, property_id) ' || set_null_floor;
  end if;
end $$;

create index if not exists idx_engineers_company   on engineers (company_id) where company_id is not null;
create index if not exists idx_work_orders_company on work_orders (company_id) where company_id is not null;
create index if not exists idx_work_orders_floor   on work_orders (floor_id) where floor_id is not null;

-- ── D1: retire the viewer role ─────────────────────────────────────────────

do $$
declare
  affected integer;
begin
  update engineers
  set is_active = false
  where is_active
    and role_id in (select id from roles where name = 'viewer');
  get diagnostics affected = row_count;
  if affected > 0 then
    raise notice 'Deactivated % viewer member(s); an Administrator can reactivate them with a current role.', affected;
  end if;
end $$;

update invitations
set expires_at = now()
where role_name = 'viewer'
  and used_at is null
  and expires_at > now();

-- ── D19: report tenant members still to be linked to a company ─────────────

do $$
declare
  unlinked integer;
begin
  select count(*) into unlinked
  from engineers e
  join roles r on r.id = e.role_id
  where r.name = 'tenant' and e.company_id is null and e.is_active;
  raise notice '% active tenant member(s) are not linked to a company yet (Floors & Tenants > Unlinked tenant users).', unlinked;
end $$;
