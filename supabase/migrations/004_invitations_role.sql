-- ============================================================
-- Migration 004: Add role_name to invitations
-- Run manually in Supabase SQL Editor
-- ============================================================

alter table invitations
  add column if not exists role_name text,
  add column if not exists invited_by text;
