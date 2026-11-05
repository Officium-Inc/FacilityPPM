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
