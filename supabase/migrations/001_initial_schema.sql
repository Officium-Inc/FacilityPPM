-- Enable UUID extension
create extension if not exists "pgcrypto";

-- Properties (top-level client accounts managed by the provider)
create table properties (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  license_status text not null default 'trial'
    check (license_status in ('active', 'suspended', 'trial')),
  created_at timestamptz default now()
);

-- Sites (belong to a property)
create table sites (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  name text not null,
  address text,
  city text,
  manager_name text,
  created_at timestamptz default now()
);

-- Buildings
create table buildings (
  id uuid primary key default gen_random_uuid(),
  site_id uuid references sites(id) on delete cascade,
  name text not null,
  floors int,
  created_at timestamptz default now()
);

-- Assets
create table assets (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references buildings(id) on delete cascade,
  name text not null,
  category text,
  make text,
  model text,
  serial_no text,
  install_date date,
  warranty_expiry date,
  location text,
  status text default 'active',
  qr_code text,
  created_at timestamptz default now()
);

-- Roles
create table roles (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  permissions jsonb default '{}'
);

-- Engineers (linked to Supabase Auth users, scoped to a property)
create table engineers (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  role_id uuid references roles(id),
  full_name text not null,
  email text not null,
  phone text,
  certifications text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- PPM Schedules
create table ppm_schedules (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references assets(id) on delete cascade,
  title text not null,
  frequency text,
  interval_days int,
  next_due date,
  priority text default 'medium',
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Work Orders (direct property_id for simple RLS and reactive WOs)
create table work_orders (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade,
  schedule_id uuid references ppm_schedules(id) on delete set null,
  engineer_id uuid references engineers(id) on delete set null,
  wo_number text unique not null,
  type text default 'ppm',
  status text default 'scheduled',
  scheduled_date date,
  completed_date timestamptz,
  notes text,
  priority text default 'medium',
  sign_off_token text unique,
  sign_off_expires_at timestamptz,
  signed_at timestamptz,
  signed_by_name text,
  signed_by_ip text,
  signed_by_device text,
  signature_data text,
  rejection_reason text,
  pdf_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Checklist Items
create table checklist_items (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid references work_orders(id) on delete cascade,
  description text not null,
  result text,
  remarks text,
  requires_photo boolean default false,
  photo_urls jsonb default '[]',
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Inventory Items (scoped to a property)
create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade,
  part_name text not null,
  part_number text,
  category text,
  qty_on_hand int default 0,
  reorder_level int default 5,
  supplier text,
  created_at timestamptz default now()
);

-- Parts Used per Work Order
create table parts_used (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid references work_orders(id) on delete cascade,
  item_id uuid references inventory_items(id),
  quantity_used int default 1,
  unit_cost numeric(10,2),
  created_at timestamptz default now()
);

-- Audit Log (scoped to a property)
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade,
  user_id uuid,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb default '{}',
  ip_address text,
  created_at timestamptz default now()
);

-- Indexes
create index on properties (slug);
create index on sites (property_id);
create index on engineers (property_id);
create index on work_orders (property_id, status);
create index on work_orders (scheduled_date);
create index on work_orders (sign_off_token);
create index on ppm_schedules (next_due, is_active);
create index on checklist_items (work_order_id);
create index on audit_log (property_id, entity_type, entity_id, created_at);
-- Prevent same auth user being added twice to the same property
create unique index engineers_user_property_unique on engineers(user_id, property_id) where user_id is not null;

-- Row Level Security
alter table properties enable row level security;
alter table sites enable row level security;
alter table buildings enable row level security;
alter table assets enable row level security;
alter table roles enable row level security;
alter table engineers enable row level security;
alter table ppm_schedules enable row level security;
alter table work_orders enable row level security;
alter table checklist_items enable row level security;
alter table inventory_items enable row level security;
alter table parts_used enable row level security;
alter table audit_log enable row level security;

-- Helper: is the current user a property member of the given property_id?
-- We check the active property_id in app_metadata (auto-switched on navigation).
-- Usage: _is_property_member(row.property_id)

-- Properties: provider can see all; property members see only their own
create policy "Provider read all properties" on properties
  for select using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'provider');

create policy "Provider insert properties" on properties
  for insert with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'provider');

create policy "Provider update properties" on properties
  for update using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'provider');

create policy "Property members read own" on properties
  for select using (
    id = ((auth.jwt() -> 'app_metadata' ->> 'property_id')::uuid)
  );

-- Sites: scoped to property (read + write for property members)
create policy "Property-scoped read sites" on sites
  for select using (
    property_id = ((auth.jwt() -> 'app_metadata' ->> 'property_id')::uuid)
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'provider'
  );
create policy "Property-scoped insert sites" on sites
  for insert with check (
    property_id = ((auth.jwt() -> 'app_metadata' ->> 'property_id')::uuid)
  );
create policy "Property-scoped update sites" on sites
  for update using (
    property_id = ((auth.jwt() -> 'app_metadata' ->> 'property_id')::uuid)
  );

-- Buildings: authenticated read; property members write (scoped via site)
create policy "Authenticated read buildings" on buildings
  for select using (auth.role() = 'authenticated');
create policy "Authenticated insert buildings" on buildings
  for insert with check (auth.role() = 'authenticated');
create policy "Authenticated update buildings" on buildings
  for update using (auth.role() = 'authenticated');

-- Assets: authenticated read + write (scoped at app layer via building→site→property)
create policy "Authenticated read assets" on assets
  for select using (auth.role() = 'authenticated');
create policy "Authenticated insert assets" on assets
  for insert with check (auth.role() = 'authenticated');
create policy "Authenticated update assets" on assets
  for update using (auth.role() = 'authenticated');

-- Roles: read-only for all authenticated users
create policy "Authenticated read roles" on roles
  for select using (auth.role() = 'authenticated');

-- Engineers: scoped to property (read + write)
create policy "Property-scoped read engineers" on engineers
  for select using (
    property_id = ((auth.jwt() -> 'app_metadata' ->> 'property_id')::uuid)
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'provider'
  );
create policy "Property-scoped insert engineers" on engineers
  for insert with check (
    property_id = ((auth.jwt() -> 'app_metadata' ->> 'property_id')::uuid)
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'provider'
  );
create policy "Property-scoped update engineers" on engineers
  for update using (
    property_id = ((auth.jwt() -> 'app_metadata' ->> 'property_id')::uuid)
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'provider'
  );

-- PPM Schedules: authenticated read; property member write (scoped at app layer via asset)
create policy "Authenticated read ppm_schedules" on ppm_schedules
  for select using (auth.role() = 'authenticated');
create policy "Authenticated insert ppm_schedules" on ppm_schedules
  for insert with check (auth.role() = 'authenticated');
create policy "Authenticated update ppm_schedules" on ppm_schedules
  for update using (auth.role() = 'authenticated');

-- Work Orders: scoped to property + public sign-off read by token
create policy "Property-scoped read work_orders" on work_orders
  for select using (
    property_id = ((auth.jwt() -> 'app_metadata' ->> 'property_id')::uuid)
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'provider'
    OR sign_off_token is not null
  );
create policy "Property-scoped insert work_orders" on work_orders
  for insert with check (
    property_id = ((auth.jwt() -> 'app_metadata' ->> 'property_id')::uuid)
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'provider'
  );
create policy "Property-scoped update work_orders" on work_orders
  for update using (
    property_id = ((auth.jwt() -> 'app_metadata' ->> 'property_id')::uuid)
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'provider'
    OR sign_off_token is not null
  );

-- Checklist Items: authenticated read + write
create policy "Authenticated read checklist_items" on checklist_items
  for select using (auth.role() = 'authenticated');
create policy "Authenticated insert checklist_items" on checklist_items
  for insert with check (auth.role() = 'authenticated');
create policy "Authenticated update checklist_items" on checklist_items
  for update using (auth.role() = 'authenticated');
create policy "Authenticated delete checklist_items" on checklist_items
  for delete using (auth.role() = 'authenticated');

-- Inventory Items: scoped to property
create policy "Property-scoped read inventory" on inventory_items
  for select using (
    property_id = ((auth.jwt() -> 'app_metadata' ->> 'property_id')::uuid)
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'provider'
  );
create policy "Property-scoped insert inventory" on inventory_items
  for insert with check (
    property_id = ((auth.jwt() -> 'app_metadata' ->> 'property_id')::uuid)
  );
create policy "Property-scoped update inventory" on inventory_items
  for update using (
    property_id = ((auth.jwt() -> 'app_metadata' ->> 'property_id')::uuid)
  );

-- Parts Used: authenticated read + write
create policy "Authenticated read parts_used" on parts_used
  for select using (auth.role() = 'authenticated');
create policy "Authenticated insert parts_used" on parts_used
  for insert with check (auth.role() = 'authenticated');

-- Audit Log: property-scoped read; authenticated insert (server writes via service client)
create policy "Property-scoped read audit_log" on audit_log
  for select using (
    property_id = ((auth.jwt() -> 'app_metadata' ->> 'property_id')::uuid)
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'provider'
  );
create policy "Authenticated insert audit_log" on audit_log
  for insert with check (auth.role() = 'authenticated');

-- Seed Data --

-- Roles
insert into roles (name) values ('admin'), ('supervisor'), ('engineer'), ('viewer');

-- Demo Property
insert into properties (slug, name, license_status)
values ('bgc-tower-3', 'BGC Tower 3', 'active');

-- Site
insert into sites (property_id, name, address, city, manager_name)
select id, 'BGC Tower 3 Site', '32nd Street', 'Taguig', 'Ana Santos'
from properties where slug = 'bgc-tower-3';

-- Building
insert into buildings (site_id, name, floors)
select id, 'Main Tower', 30 from sites where name = 'BGC Tower 3 Site';

-- Asset
insert into assets (building_id, name, category, make, model, location, status)
select id, 'AHU-01 Level 3', 'HVAC', 'Daikin', 'FXMQ100', 'Level 3 Ceiling Void', 'active'
from buildings where name = 'Main Tower';

-- Sample PPM Schedule
insert into ppm_schedules (asset_id, title, frequency, interval_days, next_due, priority)
select id, 'Quarterly HVAC Filter Replacement', 'quarterly', 90, current_date + 7, 'high'
from assets where name = 'AHU-01 Level 3';

-- Sample Work Order
insert into work_orders (property_id, schedule_id, wo_number, type, status, scheduled_date, priority)
select p.id, s.id, 'WO-1042', 'ppm', 'assigned', current_date + 3, 'high'
from ppm_schedules s, properties p
where s.title = 'Quarterly HVAC Filter Replacement'
  and p.slug = 'bgc-tower-3';

-- Checklist Items for WO-1042
insert into checklist_items (work_order_id, description, sort_order)
select wo.id, item.item_desc, item.item_ord from work_orders wo,
(values
  ('AHU filter replacement (Level 3 unit)', 1),
  ('Condensate drain cleared and flushed', 2),
  ('Fan belt tension and condition check', 3),
  ('Post-maintenance functional test run', 4)
) as item(item_desc, item_ord)
where wo.wo_number = 'WO-1042';
