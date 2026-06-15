-- ============================================================
-- Migration 013: Property-scoped Monday.com integrations
-- Run manually in Supabase SQL Editor AFTER 012_monday_tenant360_sync.sql
-- ============================================================

create table if not exists property_monday_integrations (
  id                    uuid primary key default gen_random_uuid(),
  property_id           uuid not null unique references properties(id) on delete cascade,
  enabled               boolean not null default false,
  encrypted_api_token   text,
  token_last4           text,
  api_version           text not null default '2026-04',
  board_id              text,
  board_name            text,
  billed_group_id       text,
  waived_group_id       text,
  field_mappings        jsonb not null default '[]'::jsonb,
  validation_status     text not null default 'not_configured'
    check (validation_status in ('not_configured', 'token_valid', 'valid', 'invalid')),
  validation_error      text,
  created_by_user_id    uuid,
  updated_by_user_id    uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_property_monday_integrations_property_id
  on property_monday_integrations(property_id);

alter table property_monday_integrations enable row level security;

-- No direct browser policies: all reads/writes go through server routes so the
-- encrypted token never leaves the service-role boundary.

create or replace function set_property_monday_integrations_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_property_monday_integrations_updated_at
  on property_monday_integrations;

create trigger trg_property_monday_integrations_updated_at
  before update on property_monday_integrations
  for each row
  execute function set_property_monday_integrations_updated_at();
