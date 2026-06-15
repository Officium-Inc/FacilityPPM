-- ============================================================
-- Migration 009: Add original_wo_number for REPT→WO rename at assignment
-- Run manually in Supabase SQL Editor
-- ============================================================

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS original_wo_number text;
