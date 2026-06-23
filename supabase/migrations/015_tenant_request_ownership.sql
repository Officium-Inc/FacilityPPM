-- Migration 015: Track the tenant member who submitted a service request.
-- Run manually in Supabase SQL Editor after the previous migrations.

alter table work_orders
  add column if not exists requested_by_id uuid references engineers(id) on delete set null;

create index if not exists idx_work_orders_requested_by_id
  on work_orders(requested_by_id);
