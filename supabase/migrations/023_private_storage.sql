-- 023_private_storage.sql
-- Work order files (tenant photos, inspection/completion evidence, signed receipts, audit reports) are no
-- longer public. Both buckets become private; only the service role reads and writes them:
--   * signed-in users open files through /api/files/<bucket>/<path>, which checks that they may view the
--     work order and redirects to a 60-second signed URL;
--   * public sign-off links show files through short-lived signed URLs;
--   * PDFs and the Monday sync download files with the service role.
-- Stored URLs in the database are unchanged (they identify the file), so no data migration is needed.
-- Run together with the app version that adds /api/files. Safe to re-run.

update storage.buckets
set public = false
where id in ('evidence', 'receipts');

-- The app uploads optimized images (WebP), short videos and PDFs only
update storage.buckets
set file_size_limit = 26214400, -- 25 MB
    allowed_mime_types = array[
      'image/webp', 'image/jpeg', 'image/png', 'image/gif', 'image/avif',
      'video/mp4', 'video/webm', 'video/quicktime', 'video/mpeg',
      'application/pdf'
    ]
where id = 'receipts';

-- No storage policies for these buckets: anon and authenticated users get no direct access
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (coalesce(qual, '') ~ '(evidence|receipts)' or coalesce(with_check, '') ~ '(evidence|receipts)')
  loop
    execute format('drop policy %I on storage.objects', pol.policyname);
  end loop;
end $$;
