import type { SupabaseClient, User } from '@supabase/supabase-js'
import { isProviderUser } from '@/lib/authz/actor'

/**
 * What a signed-in user can open, read from the database rows (member rows and Org Admin memberships), not
 * from app_metadata. Used for the login destination, the property switcher and the suspended notice. Server-only.
 */

type Service = SupabaseClient

export interface AccessibleProperty {
  id: string
  name: string
  slug: string
}

export interface AccessibleOrganization {
  id: string
  name: string
  slug: string
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)

/** Properties where the user has an active member row (their own, or an org-managed Administrator row). */
export async function loadAccessibleProperties(service: Service, userId: string): Promise<AccessibleProperty[]> {
  const { data } = await service
    .from('engineers')
    .select('properties(id, name, slug)')
    .eq('user_id', userId)
    .eq('is_active', true)
  return (data ?? [])
    .map((row) => one(row.properties as AccessibleProperty | AccessibleProperty[] | null))
    .filter((row): row is AccessibleProperty => Boolean(row?.id))
    .sort(byName)
}

/** Organizations where the user is an active Org Admin. */
export async function loadAccessibleOrganizations(service: Service, userId: string): Promise<AccessibleOrganization[]> {
  const { data } = await service
    .from('organization_members')
    .select('organizations(id, name, slug)')
    .eq('user_id', userId)
    .eq('is_active', true)
  return (data ?? [])
    .map((row) => one(row.organizations as AccessibleOrganization | AccessibleOrganization[] | null))
    .filter((row): row is AccessibleOrganization => Boolean(row?.id))
    .sort(byName)
}

export type HomeResult = { ok: true; path: string } | { ok: false; reason: 'no-access' | 'deactivated' }

/**
 * Where the user starts after signing in: Platform Admin → organizations; an Org Admin → their organization;
 * otherwise their active property (or the first one). Users whose only rows are deactivated get `deactivated`.
 */
export async function resolveHome(service: Service, user: User): Promise<HomeResult> {
  if (isProviderUser(user)) return { ok: true, path: '/provider/organizations' }

  const [organizations, properties] = await Promise.all([
    loadAccessibleOrganizations(service, user.id),
    loadAccessibleProperties(service, user.id),
  ])
  if (organizations.length) return { ok: true, path: `/org/${organizations[0].slug}` }

  if (properties.length) {
    const active = properties.find((property) => property.slug === user.app_metadata?.property_slug)
    return { ok: true, path: `/${(active ?? properties[0]).slug}` }
  }

  const [{ count: inactiveMembers }, { count: inactiveOrgMembers }] = await Promise.all([
    service.from('engineers').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_active', false),
    service.from('organization_members').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_active', false),
  ])
  return { ok: false, reason: (inactiveMembers ?? 0) + (inactiveOrgMembers ?? 0) > 0 ? 'deactivated' : 'no-access' }
}
