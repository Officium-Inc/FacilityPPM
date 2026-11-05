import { NextRequest, NextResponse } from 'next/server'
import { authorize, requireSession } from '@/lib/authz/guard'
import { actorEngineerId, actorLog } from '@/lib/authz/actor'
import { WORK_ORDER_SCOPE_COLUMNS } from '@/lib/authz/records'
import { logWorkOrderEvent } from '@/lib/work-order-events'
import { parseSendBack, sendBackBlocker, SEND_BACK_EVENT_TYPE } from '@/lib/verification-rules'
import { syncTenant360WorkOrder } from '@/lib/monday/tenant360'

interface Params {
  params: Promise<{ id: string }>
}

/**
 * Final verification: the head engineer sends submitted work back to Work Execution (D28).
 * svc_submitted -> in_progress with the note as the reason. Unlike a tenant sign-off rejection, no
 * corrective work order is raised: the same work order is redone and submitted again.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params

  const session = await requireSession()
  if (!session.ok) return session.response
  const { service } = session

  const { data: wo } = await service
    .from('work_orders')
    .select(`${WORK_ORDER_SCOPE_COLUMNS}, wo_number, status, signed_at, properties(slug)`)
    .eq('id', id)
    .maybeSingle()

  if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })

  const access = await authorize(session, 'workRequest.review', { record: wo })
  if (!access.ok) return access.response
  const { actor } = access

  const input = parseSendBack(await request.json().catch(() => null))
  if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 })

  const blocked = sendBackBlocker(wo)
  if (blocked && !blocked.ok) return NextResponse.json({ error: blocked.error }, { status: blocked.status })

  const now = new Date().toISOString()

  // Conditional update: only one final verification decision can win, and a legacy sign-off link stops working
  const { data: updated, error } = await service
    .from('work_orders')
    .update({
      status: 'in_progress',
      rejection_reason: input.reason,
      head_engineer_verified_at: null,
      sign_off_token_hash: null,
      sign_off_expires_at: null,
      updated_at: now,
    })
    .eq('id', id)
    .eq('status', 'svc_submitted')
    .is('signed_at', null)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!updated?.length) {
    return NextResponse.json({ error: 'This work order is no longer waiting for final verification.' }, { status: 409 })
  }

  await service.from('approval_trail').insert({
    work_order_id: wo.id,
    stage: 'final_verification',
    actor_name: actor.name || 'Head Engineer',
    actor_role: 'head_engineer',
    decision: 'rejected',
    reason: input.reason,
  })

  await logWorkOrderEvent(service, id, {
    eventType: SEND_BACK_EVENT_TYPE,
    step: 'Final verification',
    ...actorLog(actor),
    decision: 'Sent back',
    reason: input.reason,
    createdAt: now,
    metadata: { to_step: 'work_execution' },
  })

  // Let the assigned engineer know the work needs another pass
  const property = wo.properties as { slug?: string } | { slug?: string }[] | null
  const slug = (Array.isArray(property) ? property[0] : property)?.slug
  if (wo.engineer_id && wo.engineer_id !== actorEngineerId(actor)) {
    const { error: notifyError } = await service.from('notifications').insert({
      property_id: wo.property_id,
      engineer_id: wo.engineer_id,
      type: 'system',
      title: `${wo.wo_number} was sent back for rework`,
      message: input.reason.length > 140 ? `${input.reason.slice(0, 140)}…` : input.reason,
      link: slug ? `/${slug}/work-orders/${id}` : null,
    })
    if (notifyError) console.error('[send-back] failed to create notification:', notifyError.message)
  }

  await syncTenant360WorkOrder(id)

  return NextResponse.json({ success: true })
}
