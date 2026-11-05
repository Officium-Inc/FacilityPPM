import { NextRequest, NextResponse } from 'next/server'
import { authorize, requireSession } from '@/lib/authz/guard'
import { actorLog } from '@/lib/authz/actor'
import { WORK_ORDER_SCOPE_COLUMNS } from '@/lib/authz/records'
import { logWorkOrderEvent } from '@/lib/work-order-events'

interface Params {
  params: Promise<{ id: string }>
}

/** Simple status moves for legacy PPM work orders; the reactive workflow has its own routes. */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  scheduled: ['in_progress'],
  on_hold: ['in_progress'],
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params

  const session = await requireSession()

  if (!session.ok) return session.response

  const body = await request.json().catch(() => ({})) as { status?: string }
  const nextStatus = body.status ?? ''

  const { service } = session
  const { data: wo } = await service
    .from('work_orders')
    .select(`${WORK_ORDER_SCOPE_COLUMNS}, status`)
    .eq('id', id)
    .maybeSingle()

  if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })

  const access = await authorize(session, 'workRequest.review', { record: wo })
  if (!access.ok) return access.response

  if (!(ALLOWED_TRANSITIONS[wo.status] ?? []).includes(nextStatus)) {
    return NextResponse.json({ error: `Cannot change status from ${wo.status} to ${nextStatus || 'nothing'}.` }, { status: 409 })
  }

  const now = new Date().toISOString()
  const { error } = await service
    .from('work_orders')
    .update({ status: nextStatus, updated_at: now })
    .eq('id', id)
    .eq('status', wo.status)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logWorkOrderEvent(service, id, {
    eventType: 'status_changed',
    step: 'Status change',
    ...actorLog(access.actor),
    decision: nextStatus,
    createdAt: now,
    metadata: { from: wo.status, to: nextStatus },
  })

  return NextResponse.json({ success: true })
}
