import type { SupabaseClient, User } from '@supabase/supabase-js'
import { normalizeRoleName } from '@/lib/roles'

export interface WorkOrderEventInput {
  eventType: string
  step: string
  actorName?: string | null
  actorEmail?: string | null
  actorRole?: string | null
  decision?: string | null
  reason?: string | null
  metadata?: Record<string, unknown>
  createdAt?: string
}

export interface WorkOrderActor {
  id: string | null
  name: string
  email: string | null
  role: string
}

/** Appends a step to the work order timeline. Never throws: the audit trail must not block the workflow. */
export async function logWorkOrderEvent(
  service: SupabaseClient,
  workOrderId: string,
  event: WorkOrderEventInput
) {
  const { error } = await service.from('work_order_events').insert({
    work_order_id: workOrderId,
    event_type: event.eventType,
    step: event.step,
    actor_name: event.actorName ?? null,
    actor_email: event.actorEmail ?? null,
    actor_role: event.actorRole ?? null,
    decision: event.decision ?? null,
    reason: event.reason?.trim() || null,
    metadata: event.metadata ?? {},
    ...(event.createdAt ? { created_at: event.createdAt } : {}),
  })

  if (error) console.error('[work-order-events] failed to log event:', error.message)
}

/** Resolves the signed-in user to their engineer/member row for a property. */
export async function resolveWorkOrderActor(
  service: SupabaseClient,
  user: Pick<User, 'id' | 'email'>,
  propertyId: string | null | undefined
): Promise<WorkOrderActor> {
  const fallback: WorkOrderActor = { id: null, name: user.email ?? 'Unknown', email: user.email ?? null, role: '' }
  if (!propertyId) return fallback

  const { data } = await service
    .from('engineers')
    .select('id, full_name, email, roles(name)')
    .eq('user_id', user.id)
    .eq('property_id', propertyId)
    .maybeSingle()

  if (!data) return fallback

  const roles = data.roles as { name?: string } | { name?: string }[] | null
  const roleName = Array.isArray(roles) ? roles[0]?.name : roles?.name

  return {
    id: data.id,
    name: data.full_name || user.email || 'Unknown',
    email: data.email || user.email || null,
    role: normalizeRoleName(roleName),
  }
}
