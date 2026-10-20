import type { SupabaseClient, User } from '@supabase/supabase-js'
import { resolveWorkOrderActor, type WorkOrderActor } from '@/lib/work-order-events'

type StaffAccess =
  | { ok: true; actor: WorkOrderActor }
  | { ok: false; status: number; error: string }

const NON_STAFF_ROLES = new Set(['tenant', 'viewer'])

type ViewableWorkOrder = {
  property_id: string | null
  requested_by_id: string | null
  tenant_email: string | null
}

/**
 * Whether a signed-in user may view a work order's documents: property members and provider admins,
 * and tenants only for the reports they submitted.
 */
export async function canViewWorkOrder(
  service: SupabaseClient,
  user: User,
  wo: ViewableWorkOrder
): Promise<boolean> {
  if (user.app_metadata?.role === 'provider') return true

  const propertyIds: string[] = (user.app_metadata?.property_ids as string[] | undefined) ??
    (user.app_metadata?.property_id ? [user.app_metadata.property_id as string] : [])
  if (!wo.property_id || !propertyIds.includes(wo.property_id)) return false

  const actor = await resolveWorkOrderActor(service, user, wo.property_id)
  if (actor.role !== 'tenant') return true

  if (wo.requested_by_id) return wo.requested_by_id === actor.id
  return Boolean(wo.tenant_email) &&
    wo.tenant_email!.trim().toLowerCase() === (actor.email ?? '').trim().toLowerCase()
}

/** Allows property staff (not tenants/viewers) of the work order's property, plus provider admins. */
export async function authorizeWorkOrderStaff(
  service: SupabaseClient,
  user: User,
  propertyId: string | null | undefined
): Promise<StaffAccess> {
  if (user.app_metadata?.role === 'provider') {
    return { ok: true, actor: { id: null, name: user.email ?? 'Provider', email: user.email ?? null, role: 'provider' } }
  }

  const propertyIds: string[] = (user.app_metadata?.property_ids as string[] | undefined) ??
    (user.app_metadata?.property_id ? [user.app_metadata.property_id as string] : [])
  if (!propertyId || !propertyIds.includes(propertyId)) {
    return { ok: false, status: 403, error: 'You do not have access to this work order.' }
  }

  const actor = await resolveWorkOrderActor(service, user, propertyId)
  if (NON_STAFF_ROLES.has(actor.role)) {
    return { ok: false, status: 403, error: 'Your role cannot perform this action.' }
  }

  return { ok: true, actor }
}
