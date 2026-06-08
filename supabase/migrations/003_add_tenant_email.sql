-- ============================================================
-- Migration 003: Add tenant_email to work_orders
-- Run manually in Supabase SQL Editor
-- ============================================================

alter table work_orders
  add column if not exists tenant_email text,
  add column if not exists tenant_name  text;
