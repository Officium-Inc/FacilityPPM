-- ============================================================
-- Migration 012: Monday Tenant 360 billing sync tracking
-- Run manually in Supabase SQL Editor AFTER 011_notifications.sql
-- ============================================================

alter table work_orders
  add column if not exists monday_item_id text,
  add column if not exists monday_item_url text,
  add column if not exists monday_synced_at timestamptz,
  add column if not exists monday_sync_status text not null default 'pending'
    check (monday_sync_status in ('pending', 'synced', 'failed', 'skipped')),
  add column if not exists monday_sync_error text,
  add column if not exists monday_file_assets jsonb not null default '{}'::jsonb;

create index if not exists idx_work_orders_monday_item_id
  on work_orders(monday_item_id)
  where monday_item_id is not null;

create index if not exists idx_work_orders_monday_sync_status
  on work_orders(monday_sync_status);
