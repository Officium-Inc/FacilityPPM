/**
 * Slugs that can never name a property: they are top-level routes (`/provider`, `/org`, `/login`, …), static
 * files or page names under `/provider/properties/`. Used by the middleware and by property creation.
 * Client-safe (no server imports).
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  '_next',
  'admin',
  'api',
  'costing-approval',
  'fault-reports',
  'favicon',
  'invite',
  'login',
  'new',
  'org',
  'provider',
  'reset-password',
  'robots',
  'sign-off',
  'sitemap',
  'static',
  'suspended',
])

/** Lowercase letters, numbers and hyphens; 1–63 characters; no leading or trailing hyphen. */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export function isReservedSlug(slug: string) {
  return RESERVED_SLUGS.has(slug.trim().toLowerCase())
}

/** Checks a property or organization slug; returns an error message, or null when it is valid. */
export function slugError(slug: string, { reserved = true }: { reserved?: boolean } = {}): string | null {
  if (!slug) return 'Slug is required.'
  if (!SLUG_PATTERN.test(slug)) {
    return 'Slug may only contain lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen.'
  }
  if (reserved && RESERVED_SLUGS.has(slug)) return `"${slug}" is a reserved slug.`
  return null
}

/** A slug suggestion from a name ("BGC Tower 3" → "bgc-tower-3"). */
export function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/, '')
}
