-- ============================================================
-- Migration 018: Work order form branding
--   * Corporation name, fax and terms and conditions printed on the
--     Work Order Request form (Service Report PDF)
-- Run manually in Supabase SQL Editor AFTER 017_workflow_v3.sql
-- ============================================================

alter table properties add column if not exists legal_name text;
alter table properties add column if not exists fax text;
alter table properties add column if not exists work_order_terms text;
