import type { SupabaseClient, User } from '@supabase/supabase-js'
import { resolveWorkOrderActor, type WorkOrderActor } from '@/lib/work-order-events'

export type Access =
  | { ok: true; actor: WorkOrderActor }
  | { ok: false; status: number; error: string }

/** Roles that run the work order workflow: inspection, costing, assignment and verification. */
export const WORK_ORDER_STAFF_ROLES: readonly string[] = ['admin', 'property_manager', 'head_engineer']
export const SERVICE_GROUP_ROLE = 'service group'

type ViewableWorkOrder = {
  property_id: string | null
  requested_by_id: string | null
  tenant_email: string | null
  engineer_id?: string | null
}

export function isProviderUser(user: Pick<User, 'app_metadata'>) {
  return user.app_metadata?.role === 'provider'
}

export function userPropertyIds(user: Pick<User, 'app_metadata'>): string[] {
  return (user.app_metadata?.property_ids as string[] | undefined) ??
    (user.app_metadata?.property_id ? [user.app_metadata.property_id as string] : [])
}

function providerActor(user: Pick<User, 'email'>): WorkOrderActor {
  return { id: null, name: user.email ?? 'Provider', email: user.email ?? null, role: 'provider', isActive: true }
}

const normalizeEmail = (value: string | null | undefined) => (value ?? '').trim().toLowerCase()

/** A tenant owns a request they submitted or one addressed to their exact email. */
export function isTenantRequestOwner(
  request: { requested_by_id: string | null; tenant_email: string | null; reported_by_contact?: string | null },
  tenant: { engineerId: string | null; email: string | null }
) {
  if (tenant.engineerId && request.requested_by_id === tenant.engineerId) return true
  const email = normalizeEmail(tenant.email)
  if (!email) return false
  return normalizeEmail(request.tenant_email) === email || normalizeEmail(request.reported_by_contact) === email
}

/**
 * Allows an active member of `propertyId` whose role is in `roles`.
 * Providers pass unless `allowProvider` is false. Missing, inactive or unknown members are denied.
 */
export async function authorizePropertyRole(
  service: SupabaseClient,
  user: User,
  propertyId: string | null | undefined,
  roles: readonly string[],
  options: { allowProvider?: boolean } = {}
): Promise<Access> {
  if (isProviderUser(user)) {
    return options.allowProvider === false
      ? { ok: false, status: 403, error: 'This action must be performed by a property member.' }
      : { ok: true, actor: providerActor(user) }
  }

  if (!propertyId || !userPropertyIds(user).includes(propertyId)) {
    return { ok: false, status: 403, error: 'You do not have access to this property.' }
  }

  const actor = await resolveWorkOrderActor(service, user, propertyId)
  if (!actor.id || !actor.isActive) {
    return { ok: false, status: 403, error: 'Your account is not an active member of this property.' }
  }
  if (!roles.includes(actor.role)) {
    return { ok: false, status: 403, error: 'Your role cannot perform this action.' }
  }

  return { ok: true, actor }
}

/**
 * Whether a signed-in user may view a work order and its documents: providers, active staff of its property,
 * the assigned Service Group member, and tenants for their own requests.
 */
export async function canViewWorkOrder(
  service: SupabaseClient,
  user: User,
  wo: ViewableWorkOrder
): Promise<boolean> {
  if (isProviderUser(user)) return true
  if (!wo.property_id || !userPropertyIds(user).includes(wo.property_id)) return false

  const actor = await resolveWorkOrderActor(service, user, wo.property_id)
  if (!actor.id || !actor.isActive) return false
  if (WORK_ORDER_STAFF_ROLES.includes(actor.role)) return true
  if (actor.role === SERVICE_GROUP_ROLE) return Boolean(wo.engineer_id) && wo.engineer_id === actor.id
  if (actor.role === 'tenant') return isTenantRequestOwner(wo, { engineerId: actor.id, email: actor.email })
  return false
}

/**
 * Allows work order staff (Admin, Property Manager, Head Engineer by default) of the work order's property,
 * plus provider admins. Pass `assignedEngineerId` to also allow the Service Group member assigned to it.
 */
export async function authorizeWorkOrderStaff(
  service: SupabaseClient,
  user: User,
  propertyId: string | null | undefined,
  options: { roles?: readonly string[]; assignedEngineerId?: string | null } = {}
): Promise<Access> {
  const roles = options.roles ?? WORK_ORDER_STAFF_ROLES
  const allowAssigned = options.assignedEngineerId !== undefined
  const access = await authorizePropertyRole(
    service,
    user,
    propertyId,
    allowAssigned ? [...roles, SERVICE_GROUP_ROLE] : roles
  )
  if (!access.ok) return access

  if (allowAssigned && access.actor.role === SERVICE_GROUP_ROLE && !roles.includes(SERVICE_GROUP_ROLE)) {
    if (!options.assignedEngineerId || access.actor.id !== options.assignedEngineerId) {
      return { ok: false, status: 403, error: 'This work order is not assigned to you.' }
    }
  }

  return access
}
