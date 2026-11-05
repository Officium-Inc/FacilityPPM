import type { SupabaseClient } from '@supabase/supabase-js'
import { collectStorageRefs, parseStorageUrl, replaceStrings, type StorageRef } from '@/lib/storage-urls'

/** Server-only access to files in the private buckets. Call only after the caller was authorized for the data. */

type Service = SupabaseClient

/** Signed URLs live long enough to view a page, not to be shared around. */
const PAGE_SIGNED_URL_SECONDS = 60 * 60

/**
 * Replaces every stored file URL inside plain data with a signed URL, for pages without a signed-in user
 * (public token links). Files that cannot be signed keep their (non-working) stored URL.
 */
export async function withSignedFileUrls<T>(service: Service, value: T, expiresIn = PAGE_SIGNED_URL_SECONDS): Promise<T> {
  const refs = collectStorageRefs(value)
  if (refs.size === 0) return value

  const byBucket = new Map<string, Array<[string, StorageRef]>>()
  for (const entry of refs) {
    const list = byBucket.get(entry[1].bucket) ?? []
    list.push(entry)
    byBucket.set(entry[1].bucket, list)
  }

  const replacements = new Map<string, string>()
  await Promise.all(
    [...byBucket].map(async ([bucket, entries]) => {
      const { data, error } = await service.storage.from(bucket).createSignedUrls(entries.map(([, ref]) => ref.path), expiresIn)
      if (error || !data) {
        console.error('[storage] failed to sign file URLs:', error?.message)
        return
      }
      data.forEach((signed, index) => {
        if (signed.signedUrl) replacements.set(entries[index][0], signed.signedUrl)
      })
    })
  )
  return replaceStrings(value, replacements)
}

/** Downloads one of our stored files; null for other URLs or missing files. */
export async function downloadStoredFile(service: Service, url: string) {
  const ref = parseStorageUrl(url)
  if (!ref) return null
  const { data, error } = await service.storage.from(ref.bucket).download(ref.path)
  if (error || !data) return null
  return { buffer: Buffer.from(await data.arrayBuffer()), contentType: data.type || 'application/octet-stream' }
}
