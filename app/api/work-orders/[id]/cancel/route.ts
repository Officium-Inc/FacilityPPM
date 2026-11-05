import { NextRequest, NextResponse } from 'next/server'
import { authorize, requireSession } from '@/lib/authz/guard'
import { actorLog } from '@/lib/authz/actor'
import { WORK_ORDER_SCOPE_COLUMNS } from '@/lib/authz/records'
import { logWorkOrderEvent } from '@/lib/work-order-events'
import { sendCancellationEmail } from '@/lib/email'
import { syncTenant360WorkOrder } from '@/lib/monday/tenant360'

interface Params {
  params: Promise<{ id: string }>
}

/** Staff cancel during inspection or costing; tenants may withdraw their request before inspection starts (D9). */
const STAFF_CANCELLABLE_STATUSES = ['inspecting', 'costing', 'pending_approval']
const TENANT_CANCELLABLE_STATUSES = ['new_report']

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params

  const session = await requireSession()
  if (!session.ok) return session.response

  const { reason } = await request.json().catch(() => ({})) as { reason?: string }
  if (!reason?.trim()) {
    return NextResponse.json({ error: 'A cancellation reason is required.' }, { status: 400 })
  }

  const { service } = session

  const { data: wo } = await service
    .from('work_orders')
    .select(`${WORK_ORDER_SCOPE_COLUMNS}, status, wo_number, tenant_name, properties(name, slug)`)
    .eq('id', id)
    .maybeSingle()

  if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })

  const access = await authorize(session, 'workRequest.cancel', { record: wo })
  if (!access.ok) return access.response
  const { actor } = access

  const isTenant = actor.kind === 'member' && actor.role === 'tenant'
  const cancellable = isTenant ? TENANT_CANCELLABLE_STATUSES : STAFF_CANCELLABLE_STATUSES
  if (!cancellable.includes(wo.status)) {
    return NextResponse.json(
      {
        error: isTenant
          ? 'You can only cancel a request before the inspection starts.'
          : 'A request can only be cancelled during inspection or costing.',
      },
      { status: 409 }
    )
  }

  const stage = wo.status === 'new_report' ? 'submission' : wo.status === 'inspecting' ? 'inspection' : 'costing'
  const cleanReason = reason.trim()
  const now = new Date().toISOString()

  // Clearing the tokens also invalidates any cost approval link already sent to the tenant
  const { error } = await service.from('work_orders').update({
    status: 'cancelled',
    cancelled_at: now,
    cancelled_by_name: actor.name,
    cancellation_reason: cleanReason,
    cancelled_stage: stage,
    costing_token_hash: null,
    costing_token_expires_at: null,
    sign_off_token_hash: null,
    sign_off_expires_at: null,
    updated_at: now,
  }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logWorkOrderEvent(service, id, {
    eventType: 'cancelled',
    step: stage === 'costing' ? 'Costing cancelled' : stage === 'submission' ? 'Request withdrawn by tenant' : 'Request cancelled at inspection',
    ...actorLog(actor),
    decision: 'Cancelled',
    reason: cleanReason,
    createdAt: now,
    metadata: { stage },
  })

  const property = wo.properties as { name?: string; slug?: string } | { name?: string; slug?: string }[] | null
  const propertyInfo = Array.isArray(property) ? property[0] : property

  // A tenant withdrawing their own request does not need to be told about it
  if (wo.requested_by_id && !isTenant) {
    const { error: notifyError } = await service.from('notifications').insert({
      property_id: wo.property_id,
      engineer_id: wo.requested_by_id,
      type: 'system',
      title: `Service report ${wo.wo_number} was cancelled`,
      message: cleanReason.length > 140 ? `${cleanReason.slice(0, 140)}…` : cleanReason,
      link: propertyInfo?.slug ? `/${propertyInfo.slug}/tenant/service-requests/${id}` : null,
    })
    if (notifyError) console.error('[cancel] failed to create notification:', notifyError.message)
  }

  if (wo.tenant_email && !isTenant) {
    try {
      await sendCancellationEmail({
        toEmail: wo.tenant_email,
        toName: wo.tenant_name,
        woNumber: wo.wo_number,
        propertyName: propertyInfo?.name ?? 'your property',
        stage,
        reason: cleanReason,
      })
    } catch {
      // Email is best-effort; the tenant is also notified in-app
    }
  }

  await syncTenant360WorkOrder(id, { findExisting: true })

  return NextResponse.json({ success: true })
}
