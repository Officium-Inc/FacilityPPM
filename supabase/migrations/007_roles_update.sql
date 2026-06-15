-- ============================================================
-- Migration 007: Role restructure + Waived Orders columns
-- Run manually in Supabase SQL Editor
-- ============================================================

-- 1. Rename 'engineer' → 'head_engineer' (preserves existing role_id assignments)
UPDATE roles SET name = 'head_engineer' WHERE name = 'engineer';

-- 2. Remove 'supervisor' role
--    (Set role_id to NULL for any engineers who had this role first)
UPDATE engineers SET role_id = NULL
  WHERE role_id = (SELECT id FROM roles WHERE name = 'supervisor');
DELETE FROM roles WHERE name = 'supervisor';

-- 3. Add 'property_manager' role
INSERT INTO roles (name) VALUES ('property_manager')
  ON CONFLICT (name) DO NOTHING;

-- 4. Waived Orders columns on work_orders
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS is_cost_waived       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cost_waived_at        timestamptz,
  ADD COLUMN IF NOT EXISTS cost_waived_by_name   text,
  ADD COLUMN IF NOT EXISTS cost_waived_reason    text;
