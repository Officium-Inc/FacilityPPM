import type { SupabaseClient, User } from '@supabase/supabase-js'
import { resolveWorkOrderActor, type WorkOrderActor } from '@/lib/work-order-events'

type StaffAccess =
  | { ok: true; actor: WorkOrderActor }
  | { ok: false; status: number; error: string }

const NON_STAFF_ROLES = new Set(['tenant', 'viewer'])

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
