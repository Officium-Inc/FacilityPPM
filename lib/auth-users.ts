import type { SupabaseClient, User } from '@supabase/supabase-js'

const PAGE_SIZE = 1000

/**
 * Finds an auth user by exact email. Uses the member table as a fast path, then pages through auth users
 * (listUsers only returns one page, so a single call misses users once the project grows).
 */
export async function findAuthUserByEmail(service: SupabaseClient, email: string): Promise<User | null> {
  const target = email.trim().toLowerCase()
  if (!target) return null

  const { data: members } = await service
    .from('engineers')
    .select('user_id')
    .eq('email', target)
    .not('user_id', 'is', null)
    .limit(1)

  const knownId = members?.[0]?.user_id as string | undefined
  if (knownId) {
    const { data } = await service.auth.admin.getUserById(knownId)
    if (data?.user && data.user.email?.toLowerCase() === target) return data.user
  }

  for (let page = 1; ; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: PAGE_SIZE })
    if (error) throw error
    const users = data?.users ?? []
    const match = users.find((u) => u.email?.toLowerCase() === target)
    if (match) return match
    if (users.length < PAGE_SIZE) return null
  }
}

function idsAndSlugs(meta: Record<string, unknown>) {
  const ids = (meta.property_ids as string[] | undefined) ?? (meta.property_id ? [meta.property_id as string] : [])
  const slugs = (meta.property_slugs as string[] | undefined) ?? (meta.property_slug ? [meta.property_slug as string] : [])
  return { ids, slugs }
}

/** Adds a property to the user's accessible properties (app_metadata), keeping their active one. */
export async function grantPropertyAccess(
  service: SupabaseClient,
  user: Pick<User, 'id' | 'app_metadata'>,
  property: { id: string; slug: string }
) {
  const meta = { ...(user.app_metadata ?? {}) } as Record<string, unknown>
  const { ids, slugs } = idsAndSlugs(meta)
  // 'superadmin' was written by older invite code and has no meaning
  if (meta.role === 'superadmin') delete meta.role

  return service.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...meta,
      property_ids: [...new Set([...ids, property.id])],
      property_slugs: [...new Set([...slugs, property.slug])],
      property_id: (meta.property_id as string | undefined) ?? property.id,
      property_slug: (meta.property_slug as string | undefined) ?? property.slug,
    },
  })
}

export interface AccessEntry {
  id: string
  slug: string
}

export interface UserAccessRows {
  /** Properties with a member row of the user's own (not created by an organization membership). */
  properties: AccessEntry[]
  /** Organizations where the user is an active Org Admin. */
  organizations: AccessEntry[]
  /** Properties of those organizations. */
  organizationProperties: AccessEntry[]
}

function uniqueEntries(entries: AccessEntry[]) {
  const seen = new Map<string, AccessEntry>()
  for (const entry of entries) if (entry.id && entry.slug && !seen.has(entry.id)) seen.set(entry.id, entry)
  return [...seen.values()]
}

/**
 * The app_metadata access lists for the given rows (pure). Org Admins reach the organization's properties
 * through `org_ids`, so their JWT does not grow with every property. The active property is kept while it is
 * still reachable. Other keys (`role`, `terminated_property_ids`) are kept; the meaningless `superadmin` role
 * written by older code is dropped.
 */
export function buildAccessMetadata(meta: Record<string, unknown>, rows: UserAccessRows): Record<string, unknown> {
  const next = { ...meta }
  if (next.role === 'superadmin') delete next.role

  const properties = uniqueEntries(rows.properties)
  const organizations = uniqueEntries(rows.organizations)
  const reachable = uniqueEntries([...properties, ...rows.organizationProperties])
  const active = reachable.find((entry) => entry.id === meta.property_id) ?? reachable[0] ?? null

  return {
    ...next,
    property_ids: properties.map((entry) => entry.id),
    property_slugs: properties.map((entry) => entry.slug),
    org_ids: organizations.map((entry) => entry.id),
    org_slugs: organizations.map((entry) => entry.slug),
    property_id: active?.id ?? null,
    property_slug: active?.slug ?? null,
  }
}

function relationEntry(value: unknown): AccessEntry | null {
  const row = (Array.isArray(value) ? value[0] : value) as { id?: string; slug?: string } | null | undefined
  return row?.id && row.slug ? { id: row.id, slug: row.slug } : null
}

/** Reads the member rows and Org Admin memberships that decide what the user may enter. */
export async function loadUserAccessRows(service: SupabaseClient, userId: string): Promise<UserAccessRows> {
  const [{ data: memberRows }, { data: orgRows }] = await Promise.all([
    service.from('engineers').select('org_member_id, properties(id, slug)').eq('user_id', userId),
    service.from('organization_members').select('organizations(id, slug)').eq('user_id', userId).eq('is_active', true),
  ])

  const properties = (memberRows ?? [])
    .filter((row) => !row.org_member_id)
    .map((row) => relationEntry(row.properties))
    .filter((entry): entry is AccessEntry => Boolean(entry))
  const organizations = (orgRows ?? [])
    .map((row) => relationEntry(row.organizations))
    .filter((entry): entry is AccessEntry => Boolean(entry))

  const { data: orgProperties } = organizations.length
    ? await service.from('properties').select('id, slug').in('organization_id', organizations.map((org) => org.id))
    : { data: [] }

  return { properties, organizations, organizationProperties: (orgProperties ?? []) as AccessEntry[] }
}

/**
 * Rebuilds the user's access lists in app_metadata (`property_ids/slugs`, `org_ids/slugs`, the active property)
 * from the database rows. Call it after any change to the user's member rows or Org Admin memberships.
 * Platform Admin users are left unchanged.
 */
export async function syncUserAccess(service: SupabaseClient, userId: string): Promise<{ error: string | null }> {
  const { data: userData, error: userError } = await service.auth.admin.getUserById(userId)
  if (userError || !userData?.user) return { error: userError?.message ?? 'User not found.' }
  const user = userData.user
  if (user.app_metadata?.role === 'provider') return { error: null }

  const rows = await loadUserAccessRows(service, userId)
  const { error } = await service.auth.admin.updateUserById(userId, {
    app_metadata: buildAccessMetadata({ ...(user.app_metadata ?? {}) }, rows),
  })
  return { error: error?.message ?? null }
}

/** Removes a property from the user's accessible properties (app_metadata). */
export async function revokePropertyAccess(service: SupabaseClient, userId: string, propertyId: string) {
  const [{ data: userData }, { data: property }] = await Promise.all([
    service.auth.admin.getUserById(userId),
    service.from('properties').select('slug').eq('id', propertyId).maybeSingle(),
  ])
  if (!userData?.user) return

  const meta = userData.user.app_metadata ?? {}
  const { ids, slugs } = idsAndSlugs(meta)
  const newIds = ids.filter((id) => id !== propertyId)
  const newSlugs = property?.slug ? slugs.filter((slug) => slug !== property.slug) : slugs
  const activeRemoved = meta.property_id === propertyId

  await service.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...meta,
      property_ids: newIds,
      property_slugs: newSlugs,
      property_id: activeRemoved ? newIds[0] ?? null : meta.property_id ?? null,
      property_slug: activeRemoved ? newSlugs[0] ?? null : meta.property_slug ?? null,
    },
  })
}
