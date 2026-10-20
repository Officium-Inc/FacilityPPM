-- ============================================================
-- Migration 017: Workflow v3
--   * Tenant form fields (Tenant / Lessee) and engineer-assessed priority
--   * Third-party contractor + cancellation fields on work orders
--   * Work order event log (feeds the audit report)
--   * Audit report URL
-- Run manually in Supabase SQL Editor AFTER 016_property_profile.sql
-- ============================================================

-- Tenant / Lessee captured on the service report form
alter table work_order_reports
  add column if not exists tenant_lessee text;

-- Urgency is assessed by engineers at inspection, so it is empty until then
alter table work_order_reports alter column urgency drop not null;
alter table work_order_reports alter column urgency drop default;

-- Execution mode, cancellation and audit report
alter table work_orders
  add column if not exists execution_mode     text not null default 'in_house',
  add column if not exists contractor_name    text,
  add column if not exists contractor_contact text,
  add column if not exists contractor_notes   text,
  add column if not exists cancelled_at       timestamptz,
  add column if not exists cancelled_by_name  text,
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_stage    text,
  add column if not exists audit_report_url   text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'work_orders_execution_mode_check'
  ) then
    alter table work_orders
      add constraint work_orders_execution_mode_check
      check (execution_mode in ('in_house', 'third_party'));
  end if;
end $$;

-- Event log: one row per workflow step, used to build the audit report timeline
create table if not exists work_order_events (
  id            uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  event_type    text not null,   -- e.g. 'report_submitted', 'inspection_completed', 'cancelled'
  step          text not null,   -- human readable step label
  actor_name    text,
  actor_email   text,
  actor_role    text,
  decision      text,            -- e.g. 'Submitted', 'Approved', 'Cancelled'
  reason        text,
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create index if not exists idx_work_order_events_wo
  on work_order_events(work_order_id, created_at);

alter table work_order_events enable row level security;

create policy "Property-scoped read work_order_events" on work_order_events
  for select using (
    work_order_id in (
      select id from work_orders
      where property_id = ((auth.jwt() -> 'app_metadata' ->> 'property_id')::uuid)
      or (auth.jwt() -> 'app_metadata' ->> 'role') = 'provider'
    )
  );
create policy "Service insert work_order_events" on work_order_events
  for insert with check (true);
