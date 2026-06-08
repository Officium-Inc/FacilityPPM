-- ============================================================
-- Migration 002: Work Order Approval Workflow Redesign
-- Run manually in Supabase SQL Editor AFTER 001_initial_schema.sql
-- ============================================================

-- ── New tables ────────────────────────────────────────────────

-- Fault reports: initial submission by tenant / facility manager
create table if not exists work_order_reports (
  id              uuid primary key default gen_random_uuid(),
  work_order_id   uuid references work_orders(id) on delete cascade,
  fault_description text not null,
  location_notes  text,
  reported_by_name    text not null,
  reported_by_contact text,
  urgency         text not null default 'medium'
    check (urgency in ('critical', 'high', 'medium', 'low')),
  photo_urls      jsonb default '[]',
  -- Inspection fields (filled by engineer at Stage 2)
  inspection_notes      text,
  root_cause            text,
  scope_of_work         text,
  inspection_photo_urls jsonb default '[]',
  inspected_by_id       uuid references engineers(id) on delete set null,
  inspected_at          timestamptz,
  created_at      timestamptz default now()
);

-- Cost estimates: labour, materials, subcontractor charges
create table if not exists work_order_costings (
  id              uuid primary key default gen_random_uuid(),
  work_order_id   uuid not null references work_orders(id) on delete cascade,
  labour_hours    numeric(8,2) default 0,
  labour_rate     numeric(10,2) default 0,
  labour_total    numeric(10,2) generated always as (labour_hours * labour_rate) stored,
  materials_total numeric(10,2) default 0,
  subcontractor_total numeric(10,2) default 0,
  grand_total     numeric(10,2) generated always as
    (labour_hours * labour_rate + materials_total + subcontractor_total) stored,
  line_items      jsonb default '[]', -- [{description, qty, unit_cost}]
  notes           text,
  submitted_by_id uuid references engineers(id) on delete set null,
  submitted_at    timestamptz default now(),
  created_at      timestamptz default now()
);

-- Completion evidence: photos + description submitted before requesting sign-off
create table if not exists work_order_completion_evidence (
  id              uuid primary key default gen_random_uuid(),
  work_order_id   uuid not null references work_orders(id) on delete cascade,
  work_description text not null,
  completion_photo_urls jsonb default '[]',
  supporting_doc_urls   jsonb default '[]',
  submitted_by_id uuid references engineers(id) on delete set null,
  submitted_at    timestamptz default now(),
  created_at      timestamptz default now()
);

-- Service ratings: star rating + comment from tenant after sign-off
create table if not exists service_ratings (
  id              uuid primary key default gen_random_uuid(),
  work_order_id   uuid not null references work_orders(id) on delete cascade,
  rated_engineer_id uuid references engineers(id) on delete set null,
  rating          smallint not null check (rating between 1 and 5),
  comment         text,
  submitted_by_name text,
  rated_at        timestamptz default now()
);

-- Approval trail: immutable log of every approval/rejection decision
create table if not exists approval_trail (
  id              uuid primary key default gen_random_uuid(),
  work_order_id   uuid not null references work_orders(id) on delete cascade,
  stage           text not null, -- 'costing_approval' | 'sign_off' | 'final_verification'
  actor_name      text not null,
  actor_role      text not null, -- 'tenant' | 'engineer' | 'head_engineer'
  decision        text not null check (decision in ('approved', 'rejected')),
  reason          text,          -- required on rejection
  signature_data  text,          -- base64 PNG, optional
  ip_address      text,
  created_at      timestamptz default now()
);

-- ── New columns on work_orders ────────────────────────────────

alter table work_orders
  add column if not exists report_id                  uuid references work_order_reports(id) on delete set null,
  add column if not exists costing_token              text unique,
  add column if not exists costing_token_expires_at   timestamptz,
  add column if not exists costing_approved_at        timestamptz,
  add column if not exists costing_approved_by_name   text,
  add column if not exists costing_approval_signature text,
  add column if not exists head_engineer_id           uuid references engineers(id) on delete set null,
  add column if not exists head_engineer_verified_at  timestamptz,
  add column if not exists head_engineer_notes        text,
  add column if not exists due_date                   date,
  add column if not exists assignment_instructions    text,
  add column if not exists hours_logged               numeric(8,2),
  add column if not exists rating                     smallint check (rating between 1 and 5),
  add column if not exists rating_comment             text;

-- ── Indexes ───────────────────────────────────────────────────

create index if not exists idx_work_order_reports_wo    on work_order_reports(work_order_id);
create index if not exists idx_work_order_costings_wo   on work_order_costings(work_order_id);
create index if not exists idx_completion_evidence_wo   on work_order_completion_evidence(work_order_id);
create index if not exists idx_service_ratings_wo       on service_ratings(work_order_id);
create index if not exists idx_approval_trail_wo        on approval_trail(work_order_id);
create index if not exists idx_work_orders_costing_token on work_orders(costing_token);

-- ── RLS ───────────────────────────────────────────────────────

alter table work_order_reports              enable row level security;
alter table work_order_costings             enable row level security;
alter table work_order_completion_evidence  enable row level security;
alter table service_ratings                 enable row level security;
alter table approval_trail                  enable row level security;

-- work_order_reports: property-scoped via work_order + public costing token read
create policy "Property-scoped read work_order_reports" on work_order_reports
  for select using (
    work_order_id in (
      select id from work_orders
      where property_id = ((auth.jwt() -> 'app_metadata' ->> 'property_id')::uuid)
      or (auth.jwt() -> 'app_metadata' ->> 'role') = 'provider'
      or costing_token is not null
      or sign_off_token is not null
    )
  );
create policy "Authenticated insert work_order_reports" on work_order_reports
  for insert with check (true);
create policy "Authenticated update work_order_reports" on work_order_reports
  for update using (true);

-- work_order_costings
create policy "Property-scoped read work_order_costings" on work_order_costings
  for select using (
    work_order_id in (
      select id from work_orders
      where property_id = ((auth.jwt() -> 'app_metadata' ->> 'property_id')::uuid)
      or (auth.jwt() -> 'app_metadata' ->> 'role') = 'provider'
      or costing_token is not null
    )
  );
create policy "Authenticated insert work_order_costings" on work_order_costings
  for insert with check (true);
create policy "Authenticated update work_order_costings" on work_order_costings
  for update using (true);

-- work_order_completion_evidence
create policy "Property-scoped read completion_evidence" on work_order_completion_evidence
  for select using (
    work_order_id in (
      select id from work_orders
      where property_id = ((auth.jwt() -> 'app_metadata' ->> 'property_id')::uuid)
      or (auth.jwt() -> 'app_metadata' ->> 'role') = 'provider'
      or sign_off_token is not null
    )
  );
create policy "Authenticated insert completion_evidence" on work_order_completion_evidence
  for insert with check (true);

-- service_ratings
create policy "Property-scoped read service_ratings" on service_ratings
  for select using (
    work_order_id in (
      select id from work_orders
      where property_id = ((auth.jwt() -> 'app_metadata' ->> 'property_id')::uuid)
      or (auth.jwt() -> 'app_metadata' ->> 'role') = 'provider'
    )
  );
create policy "Public insert service_ratings" on service_ratings
  for insert with check (true);

-- approval_trail (immutable — no update/delete)
create policy "Property-scoped read approval_trail" on approval_trail
  for select using (
    work_order_id in (
      select id from work_orders
      where property_id = ((auth.jwt() -> 'app_metadata' ->> 'property_id')::uuid)
      or (auth.jwt() -> 'app_metadata' ->> 'role') = 'provider'
    )
  );
create policy "Public insert approval_trail" on approval_trail
  for insert with check (true);
