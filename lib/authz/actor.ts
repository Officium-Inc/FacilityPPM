import type { SupabaseClient, User } from '@supabase/supabase-js'
import { roleNameFromRelation } from '@/lib/roles'
import { toPropertyRole, type PropertyRole } from './permissions'

export interface ProviderActor {
  kind: 'provider'
  userId: string
  email: string | null
  name: string
}

export interface MemberActor {
  kind: 'member'
  userId: string
  email: string | null
  name: string
  propertyId: string
  engineerId: string
  role: PropertyRole
  companyId: string | null
}

export type Actor = ProviderActor | MemberActor

export type Membership =
  | { status: 'ok'; actor: Actor }
  | { status: 'no-access' | 'deactivated' }

export function isProviderUser(user: Pick<User, 'app_metadata'>) {
  return user.app_metadata?.role === 'provider'
}

/** All properties the user may enter (app_metadata is only writable with the service role). */
export function userPropertyIds(user: Pick<User, 'app_metadata'>): string[] {
  return (user.app_metadata?.property_ids as string[] | undefined) ??
    (user.app_metadata?.property_id ? [user.app_metadata.property_id as string] : [])
}

/** The property the user is currently working in; the admin and tenant layouts keep it in sync with the URL. */
export function activePropertyId(user: Pick<User, 'app_metadata'>) {
  return (user.app_metadata?.property_id as string | undefined) ?? null
}

/**
 * Resolves who the user is inside `propertyId`: a provider, or an active member with a current role.
 * Users without a member row, deactivated members and members with a retired/unknown role get no access.
 */
export async function resolveMembership(
  service: SupabaseClient,
  user: User,
  propertyId: string | null | undefined
): Promise<Membership> {
  if (isProviderUser(user)) {
    return {
      status: 'ok',
      actor: { kind: 'provider', userId: user.id, email: user.email ?? null, name: user.email ?? 'Provider' },
    }
  }

  if (!propertyId || !userPropertyIds(user).includes(propertyId)) return { status: 'no-access' }

  const { data } = await service
    .from('engineers')
    .select('id, full_name, email, is_active, company_id, roles(name), company:tenant_companies(is_active)')
    .eq('user_id', user.id)
    .eq('property_id', propertyId)
    .maybeSingle()

  if (!data) return { status: 'no-access' }
  if (data.is_active === false) return { status: 'deactivated' }

  const role = toPropertyRole(roleNameFromRelation(data.roles))
  if (!role) return { status: 'no-access' }

  // A tenant of a deactivated company is treated as not linked (no request access)
  const companyRow = data.company as { is_active?: boolean } | { is_active?: boolean }[] | null
  const companyActive = (Array.isArray(companyRow) ? companyRow[0] : companyRow)?.is_active === true
  const companyId = role === 'tenant' && companyActive ? ((data.company_id as string | null) ?? null) : null

  return {
    status: 'ok',
    actor: {
      kind: 'member',
      userId: user.id,
      email: (data.email as string | null) || user.email || null,
      name: (data.full_name as string | null) || user.email || 'Unknown',
      propertyId,
      engineerId: data.id as string,
      role,
      companyId,
    },
  }
}

export async function resolveActor(service: SupabaseClient, user: User, propertyId: string | null | undefined) {
  const membership = await resolveMembership(service, user, propertyId)
  return membership.status === 'ok' ? membership.actor : null
}

/** Actor fields for the work order event log. */
export function actorLog(actor: Actor) {
  return {
    actorName: actor.name,
    actorEmail: actor.email,
    actorRole: actor.kind === 'provider' ? 'provider' : actor.role,
  }
}

/** The member row id of the actor, or null for providers. */
export function actorEngineerId(actor: Actor) {
  return actor.kind === 'member' ? actor.engineerId : null
}
