/** Bucket for work order attachments, signed receipts and service report photos. */
export const WORK_ORDER_FILE_BUCKET = 'receipts'

const MAX_FILES = 20

function publicBucketBase() {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
  return `${base}/storage/v1/object/public/${WORK_ORDER_FILE_BUCKET}/`
}

/** Storage path for a new work order attachment: always under the work order's property. */
export function workOrderFilePath(propertyId: string, workOrderId: string, fileName: string) {
  return `${propertyId}/${workOrderId}/${fileName}`
}

/**
 * Keeps only file URLs uploaded through the work order upload endpoint for this work order
 * (current `<property>/<work order>/` paths and the older `<work order>/` paths).
 */
export function sanitizeWorkOrderFileUrls(value: unknown, propertyId: string, workOrderId: string): string[] {
  if (!Array.isArray(value)) return []
  const base = publicBucketBase()
  const prefixes = [`${base}${propertyId}/${workOrderId}/`, `${base}${workOrderId}/`]
  return value
    .filter((url): url is string => typeof url === 'string' && prefixes.some((prefix) => url.startsWith(prefix)))
    .filter((url) => !url.includes('..'))
    .slice(0, MAX_FILES)
}
