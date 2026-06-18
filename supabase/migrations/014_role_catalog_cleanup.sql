-- ============================================================
-- Migration 014: Canonical role catalog cleanup
-- Run manually in Supabase SQL Editor
-- ============================================================

-- Ensure the current role catalog exists.
INSERT INTO roles (name) VALUES
  ('admin'),
  ('property_manager'),
  ('head_engineer'),
  ('service group'),
  ('tenant'),
  ('viewer')
ON CONFLICT (name) DO NOTHING;

-- Normalize pending invitation role names.
UPDATE invitations
SET role_name = 'admin'
WHERE lower(trim(replace(replace(role_name, '_', ' '), '-', ' '))) IN ('admin', 'administrator');

UPDATE invitations
SET role_name = 'property_manager'
WHERE lower(trim(replace(replace(role_name, '_', ' '), '-', ' '))) = 'property manager';

UPDATE invitations
SET role_name = 'head_engineer'
WHERE lower(trim(replace(replace(role_name, '_', ' '), '-', ' '))) IN ('engineer', 'head engineer');

UPDATE invitations
SET role_name = 'service group'
WHERE lower(trim(replace(replace(role_name, '_', ' '), '-', ' '))) = 'service group';

UPDATE invitations
SET role_name = 'tenant'
WHERE lower(trim(replace(replace(role_name, '_', ' '), '-', ' '))) = 'tenant';

UPDATE invitations
SET role_name = 'viewer'
WHERE lower(trim(replace(replace(role_name, '_', ' '), '-', ' '))) = 'viewer';

-- Repoint members from legacy duplicate role rows to canonical role rows.
UPDATE engineers
SET role_id = (SELECT id FROM roles WHERE name = 'admin')
WHERE role_id IN (
  SELECT id FROM roles
  WHERE lower(trim(replace(replace(name, '_', ' '), '-', ' '))) IN ('admin', 'administrator')
    AND name <> 'admin'
);

UPDATE engineers
SET role_id = (SELECT id FROM roles WHERE name = 'property_manager')
WHERE role_id IN (
  SELECT id FROM roles
  WHERE lower(trim(replace(replace(name, '_', ' '), '-', ' '))) = 'property manager'
    AND name <> 'property_manager'
);

UPDATE engineers
SET role_id = (SELECT id FROM roles WHERE name = 'head_engineer')
WHERE role_id IN (
  SELECT id FROM roles
  WHERE lower(trim(replace(replace(name, '_', ' '), '-', ' '))) IN ('engineer', 'head engineer')
    AND name <> 'head_engineer'
);

UPDATE engineers
SET role_id = (SELECT id FROM roles WHERE name = 'service group')
WHERE role_id IN (
  SELECT id FROM roles
  WHERE lower(trim(replace(replace(name, '_', ' '), '-', ' '))) = 'service group'
    AND name <> 'service group'
);

UPDATE engineers
SET role_id = (SELECT id FROM roles WHERE name = 'tenant')
WHERE role_id IN (
  SELECT id FROM roles
  WHERE lower(trim(replace(replace(name, '_', ' '), '-', ' '))) = 'tenant'
    AND name <> 'tenant'
);

UPDATE engineers
SET role_id = (SELECT id FROM roles WHERE name = 'viewer')
WHERE role_id IN (
  SELECT id FROM roles
  WHERE lower(trim(replace(replace(name, '_', ' '), '-', ' '))) = 'viewer'
    AND name <> 'viewer'
);

-- Remove legacy role rows after reassignment.
DELETE FROM roles
WHERE lower(trim(replace(replace(name, '_', ' '), '-', ' '))) IN (
    'admin',
    'administrator',
    'property manager',
    'engineer',
    'head engineer',
    'service group',
    'tenant',
    'viewer'
  )
  AND name NOT IN ('admin', 'property_manager', 'head_engineer', 'service group', 'tenant', 'viewer');

-- Retire the old supervisor role.
UPDATE engineers
SET role_id = NULL
WHERE role_id IN (
  SELECT id FROM roles
  WHERE lower(trim(replace(replace(name, '_', ' '), '-', ' '))) = 'supervisor'
);

DELETE FROM roles
WHERE lower(trim(replace(replace(name, '_', ' '), '-', ' '))) = 'supervisor';
