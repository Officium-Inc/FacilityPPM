import type { SupabaseClient, User } from '@supabase/supabase-js'
import { roleNameFromRelation } from '@/lib/roles'
import { isOrgRole, type OrgRole } from '@/lib/org/roles'
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

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

/**
 * Properties the user was given directly (app_metadata is only writable with the service role). Org Admins
 * reach their organization's properties through `userOrgIds()` instead.
 */
export function userPropertyIds(user: Pick<User, 'app_metadata'>): string[] {
  const ids = user.app_metadata?.property_ids
  if (Array.isArray(ids)) return stringList(ids)
  return user.app_metadata?.property_id ? [user.app_metadata.property_id as string] : []
}

/** Organizations where the user is an Org Admin (D30). */
export function userOrgIds(user: Pick<User, 'app_metadata'>): string[] {
  return stringList(user.app_metadata?.org_ids)
}

export function userOrgSlugs(user: Pick<User, 'app_metadata'>): string[] {
  return stringList(user.app_metadata?.org_slugs)
}

/**
 * Resolves who the user is inside `propertyId`: a provider, or an active member with a current role.
 * The property must be in the user's `property_ids`, or belong to one of the user's organizations
 * (`org_ids`); that is necessary but not sufficient: users without a member row, deactivated members and
 * members with a retired/unknown role get no access.
 */
export async function resolveMembership(
  service: SupabaseClient,
  user: User,
  propertyId: string | null | undefined
): Promise<Membership> {
  if (isProviderUser(user)) {
    return {
      status: 'ok',
      actor: { kind: 'provider', userId: user.id, email: user.email ?? null, name: user.email ?? 'Platform Admin' },
    }
  }

  if (!propertyId) return { status: 'no-access' }
  const direct = userPropertyIds(user).includes(propertyId)
  const orgIds = userOrgIds(user)
  if (!direct && orgIds.length === 0) return { status: 'no-access' }

  const { data } = await service
    .from('engineers')
    .select('id, full_name, email, is_active, company_id, roles(name), company:tenant_companies(is_active), property:properties(organization_id)')
    .eq('user_id', user.id)
    .eq('property_id', propertyId)
    .maybeSingle()

  if (!data) return { status: 'no-access' }
  if (!direct) {
    const propertyRow = data.property as { organization_id?: string | null } | { organization_id?: string | null }[] | null
    const organizationId = (Array.isArray(propertyRow) ? propertyRow[0] : propertyRow)?.organization_id ?? null
    if (!organizationId || !orgIds.includes(organizationId)) return { status: 'no-access' }
  }
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

/** An active Org Admin (D30), resolved for one organization. */
export interface OrgActor {
  kind: 'org_member'
  userId: string
  email: string | null
  name: string
  organizationId: string
  memberId: string
  orgRole: OrgRole
}

export type OrgMembership =
  | { status: 'ok'; actor: OrgActor | ProviderActor }
  | { status: 'no-access' | 'deactivated' }

/**
 * Resolves who the user is inside an organization: Platform Admin, or an active Org Admin. The organization
 * must be in the user's `org_ids` and the user must have an active `organization_members` row.
 */
export async function resolveOrgMembership(
  service: SupabaseClient,
  user: User,
  organizationId: string | null | undefined
): Promise<OrgMembership> {
  if (isProviderUser(user)) {
    return {
      status: 'ok',
      actor: { kind: 'provider', userId: user.id, email: user.email ?? null, name: user.email ?? 'Platform Admin' },
    }
  }
  if (!organizationId || !userOrgIds(user).includes(organizationId)) return { status: 'no-access' }

  const { data } = await service
    .from('organization_members')
    .select('id, email, full_name, org_role, is_active')
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!data) return { status: 'no-access' }
  if (data.is_active === false) return { status: 'deactivated' }
  if (!isOrgRole(data.org_role)) return { status: 'no-access' }

  return {
    status: 'ok',
    actor: {
      kind: 'org_member',
      userId: user.id,
      email: (data.email as string | null) || user.email || null,
      name: (data.full_name as string | null) || user.email || 'Unknown',
      organizationId,
      memberId: data.id as string,
      orgRole: data.org_role,
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
    // The stored value stays 'provider' (labels show "Platform Admin")
    actorRole: actor.kind === 'provider' ? 'provider' : actor.role,
  }
}

/** The member row id of the actor, or null for providers. */
export function actorEngineerId(actor: Actor) {
  return actor.kind === 'member' ? actor.engineerId : null
}
