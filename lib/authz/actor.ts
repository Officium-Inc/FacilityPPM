import type { SupabaseClient, User } from '@supabase/supabase-js'
import { isOrgRole, type OrgRole } from '@/lib/org/roles'
import type { Permissions, Portal } from './catalog'
import { PROPERTY_ROLE_COLUMNS, parsePropertyRole } from './property-role'
import type { SystemRoleKey, WorkType } from './templates'

export interface ProviderActor {
  kind: 'provider'
  userId: string
  email: string | null
  name: string
}

/** An active member of one property, with the property role they hold there (D32). */
export interface MemberActor {
  kind: 'member'
  userId: string
  email: string | null
  name: string
  propertyId: string
  engineerId: string
  roleId: string
  roleName: string
  portal: Portal
  workType: WorkType
  systemKey: SystemRoleKey | null
  /** Holds the locked Administrator role (every staff permission; exempt from escalation rules). */
  isAdministrator: boolean
  /** Effective permissions of the role. */
  permissions: Permissions
  /** Tenant-portal members only, while their company is active (D19). */
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
 * Resolves who the user is inside `propertyId`: a provider, or an active member with a property role.
 * The property must be in the user's `property_ids`, or belong to one of the user's organizations
 * (`org_ids`); that is necessary but not sufficient: users without a member row, deactivated members and
 * members without a (valid) property role get no access.
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
    .select(
      `id, full_name, email, is_active, company_id, company:tenant_companies(is_active), property:properties(organization_id), property_role:property_roles(${PROPERTY_ROLE_COLUMNS})`
    )
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

  // No role, a role of another property or a malformed one: no access (fail closed)
  const role = parsePropertyRole(data.property_role)
  if (!role || (role.propertyId && role.propertyId !== propertyId)) return { status: 'no-access' }

  // Only tenant-portal members belong to a company; a deactivated company counts as not linked (D19)
  const companyRow = data.company as { is_active?: boolean } | { is_active?: boolean }[] | null
  const companyActive = (Array.isArray(companyRow) ? companyRow[0] : companyRow)?.is_active === true
  const companyId = role.portal === 'tenant' && companyActive ? ((data.company_id as string | null) ?? null) : null

  return {
    status: 'ok',
    actor: {
      kind: 'member',
      userId: user.id,
      email: (data.email as string | null) || user.email || null,
      name: (data.full_name as string | null) || user.email || 'Unknown',
      propertyId,
      engineerId: data.id as string,
      roleId: role.id,
      roleName: role.name,
      portal: role.portal,
      workType: role.workType,
      systemKey: role.systemKey,
      isAdministrator: role.isLocked,
      permissions: role.permissions,
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

/**
 * Actor fields for the work order event log. The stored role is a label snapshot: the role's name for staff
 * (custom names included), `'tenant'` for tenant-portal members (the workflow reads it) and `'provider'` for
 * Platform Admin (labels show "Platform Admin").
 */
export function actorLog(actor: Actor) {
  return {
    actorName: actor.name,
    actorEmail: actor.email,
    actorRole: actorRoleLabel(actor),
  }
}

export function actorRoleLabel(actor: Actor) {
  if (actor.kind === 'provider') return 'provider'
  return actor.portal === 'tenant' ? 'tenant' : actor.roleName
}

/** The member row id of the actor, or null for providers. */
export function actorEngineerId(actor: Actor) {
  return actor.kind === 'member' ? actor.engineerId : null
}
