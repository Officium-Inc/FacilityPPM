/**
 * Stored file URLs. Files live in private Supabase Storage buckets (migration 023). The database keeps each
 * file's public-object URL as a stable identifier (`<supabase>/storage/v1/object/public/<bucket>/<path>`),
 * but that URL no longer works on its own:
 *   * signed-in pages show files through the authenticated file route `/api/files/<bucket>/<path>`
 *     (`fileRouteUrl` / `withFileRouteUrls`), which checks access and redirects to a short-lived signed URL;
 *   * public token pages and server code use signed URLs or downloads (lib/storage-files.ts).
 * Pure module: safe for client components.
 */

export const FILE_BUCKETS = ['receipts', 'evidence'] as const
export type FileBucket = (typeof FILE_BUCKETS)[number]

export interface StorageRef {
  bucket: FileBucket
  path: string
}

const PUBLIC_OBJECT_SEGMENT = '/storage/v1/object/public/'
export const FILE_ROUTE_PREFIX = '/api/files/'

function trimSlash(value: string | undefined) {
  return (value ?? '').replace(/\/$/, '')
}

function supabaseBase() {
  return trimSlash(process.env.NEXT_PUBLIC_SUPABASE_URL)
}

function appBase() {
  return trimSlash(process.env.NEXT_PUBLIC_APP_URL)
}

function isFileBucket(value: string): value is FileBucket {
  return (FILE_BUCKETS as readonly string[]).includes(value)
}

/** Validates a bucket + object path (no traversal, no absolute or backslash paths). */
export function toStorageRef(bucket: string, path: string): StorageRef | null {
  if (!isFileBucket(bucket)) return null
  if (!path || path.length > 512 || path.startsWith('/') || path.includes('\\')) return null
  if (path.split('/').some((segment) => !segment || segment === '.' || segment === '..')) return null
  return { bucket, path }
}

/**
 * Bucket and path of one of our stored files, from its stored (public-object) URL or a file-route URL
 * (relative, or absolute on this app's origin). Anything else returns null.
 */
export function parseStorageUrl(url: unknown): StorageRef | null {
  if (typeof url !== 'string' || !url) return null

  let rest: string | null = null
  const storagePrefix = `${supabaseBase()}${PUBLIC_OBJECT_SEGMENT}`
  const app = appBase()
  if (supabaseBase() && url.startsWith(storagePrefix)) rest = url.slice(storagePrefix.length)
  else if (url.startsWith(FILE_ROUTE_PREFIX)) rest = url.slice(FILE_ROUTE_PREFIX.length)
  else if (app && url.startsWith(`${app}${FILE_ROUTE_PREFIX}`)) rest = url.slice(app.length + FILE_ROUTE_PREFIX.length)
  if (!rest) return null

  rest = rest.split(/[?#]/)[0]
  const slash = rest.indexOf('/')
  if (slash <= 0) return null
  let path: string
  try {
    path = rest.slice(slash + 1).split('/').map(decodeURIComponent).join('/')
  } catch {
    return null
  }
  return toStorageRef(rest.slice(0, slash), path)
}

/** The stored (identifier) URL for a file. */
export function storedFileUrl(ref: StorageRef) {
  return `${supabaseBase()}${PUBLIC_OBJECT_SEGMENT}${ref.bucket}/${ref.path}`
}

/** Converts a file-route URL coming back from the browser to the stored form; other URLs are unchanged. */
export function toStoredFileUrl(url: string) {
  const ref = parseStorageUrl(url)
  return ref ? storedFileUrl(ref) : url
}

/** The authenticated file route for a stored file; other URLs are returned unchanged. */
export function fileRouteUrl(url: string, options: { absolute?: boolean } = {}) {
  const ref = parseStorageUrl(url)
  if (!ref) return url
  const route = `${FILE_ROUTE_PREFIX}${ref.bucket}/${ref.path.split('/').map(encodeURIComponent).join('/')}`
  return options.absolute && appBase() ? `${appBase()}${route}` : route
}

function mapStrings<T>(value: T, map: (text: string) => string): T {
  if (typeof value === 'string') return map(value) as T
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, map)) as T
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) out[key] = mapStrings(item, map)
    return out as T
  }
  return value
}

/** Replaces every stored file URL inside plain data with its file-route URL (for signed-in users' pages). */
export function withFileRouteUrls<T>(value: T): T {
  return mapStrings(value, (text) => (parseStorageUrl(text) ? fileRouteUrl(text) : text))
}

/** Every stored file referenced inside plain data. */
export function collectStorageRefs(value: unknown, refs = new Map<string, StorageRef>()) {
  mapStrings(value, (text) => {
    const ref = parseStorageUrl(text)
    if (ref) refs.set(text, ref)
    return text
  })
  return refs
}

/** Replaces strings inside plain data using a lookup table (used with signed URLs). */
export function replaceStrings<T>(value: T, replacements: Map<string, string>): T {
  return mapStrings(value, (text) => replacements.get(text) ?? text)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PDF_WITH_UUID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.pdf$/i

export type FileOwner =
  | { kind: 'workOrder'; workOrderId: string; propertyId: string | null }
  /** A tenant photo uploaded for a service report; `memberId` is the uploader (null on older uploads). */
  | { kind: 'serviceReport'; propertyId: string; memberId: string | null }

/**
 * Which record a stored file belongs to, from its path. Paths written by the app:
 *   `<property>/<work order>/<file>`            work order attachments
 *   `<work order>/<file>`                        older work order attachments
 *   `receipts/<WO number>-<work order>.pdf`      signed receipts
 *   `audit-reports/<WO number>-<work order>.pdf` audit reports
 *   `service-reports/<property>/<member>/<file>` tenant photos (older: without `<member>`)
 */
export function fileOwnerFromPath(path: string): FileOwner | null {
  const segments = path.split('/')
  const [first, second, third] = segments

  if (first === 'service-reports') {
    if (segments.length === 4 && UUID.test(second) && UUID.test(third)) {
      return { kind: 'serviceReport', propertyId: second.toLowerCase(), memberId: third.toLowerCase() }
    }
    if (segments.length === 3 && UUID.test(second)) return { kind: 'serviceReport', propertyId: second.toLowerCase(), memberId: null }
    return null
  }
  if ((first === 'receipts' || first === 'audit-reports') && segments.length === 2) {
    const match = second.match(PDF_WITH_UUID)
    return match ? { kind: 'workOrder', workOrderId: match[1].toLowerCase(), propertyId: null } : null
  }
  if (segments.length === 3 && UUID.test(first) && UUID.test(second)) {
    return { kind: 'workOrder', workOrderId: second.toLowerCase(), propertyId: first.toLowerCase() }
  }
  if (segments.length === 2 && UUID.test(first)) return { kind: 'workOrder', workOrderId: first.toLowerCase(), propertyId: null }
  return null
}
