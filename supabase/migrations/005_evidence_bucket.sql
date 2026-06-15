-- Create the 'evidence' storage bucket for work order file attachments
-- Run this in the Supabase SQL Editor

INSERT INTO storage.buckets (id, name, public)
VALUES ('evidence', 'evidence', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to the evidence bucket
-- (server-side uploads via service role bypass this, but this policy is here for completeness)
CREATE POLICY "Authenticated users can upload evidence"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'evidence');

CREATE POLICY "Evidence files are publicly readable"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'evidence');
