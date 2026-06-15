-- ============================================================
-- Migration 008: Make 'receipts' storage bucket public
-- Run manually in Supabase SQL Editor
-- ============================================================

-- Create the receipts bucket as public (if it doesn't already exist)
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow public read access to all objects in receipts bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Receipts files are publicly readable'
  ) THEN
    CREATE POLICY "Receipts files are publicly readable"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'receipts');
  END IF;
END $$;
