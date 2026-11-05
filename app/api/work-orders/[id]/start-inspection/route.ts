import { NextRequest, NextResponse } from 'next/server'
import { authorize, requireSession } from '@/lib/authz/guard'
import { actorLog } from '@/lib/authz/actor'
import { WORK_ORDER_SCOPE_COLUMNS } from '@/lib/authz/records'
import { logWorkOrderEvent } from '@/lib/work-order-events'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params

  const session = await requireSession()

  if (!session.ok) return session.response

  const { engineerId } = await request.json() as { engineerId?: string }
  if (!engineerId) return NextResponse.json({ error: 'Please select a service team member.' }, { status: 400 })

  const { service } = session

  const { data: wo } = await service
    .from('work_orders')
    .select(`${WORK_ORDER_SCOPE_COLUMNS}, status`)
    .eq('id', id)
    .single()

  if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })
  if (wo.status !== 'new_report') {
    return NextResponse.json({ error: 'Work order is not awaiting an inspection team.' }, { status: 409 })
  }

  const access = await authorize(session, 'workRequest.review', { record: wo })
  if (!access.ok) return access.response

  const { data: assignee } = await service
    .from('engineers')
    .select('id, full_name, email')
    .eq('id', engineerId)
    .eq('property_id', wo.property_id)
    .eq('is_active', true)
    .maybeSingle()

  if (!assignee) return NextResponse.json({ error: 'Service team member not found.' }, { status: 404 })

  const now = new Date().toISOString()
  const { error } = await service
    .from('work_orders')
    .update({ engineer_id: assignee.id, status: 'inspecting', updated_at: now })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logWorkOrderEvent(service, id, {
    eventType: 'inspection_assigned',
    step: 'Inspection assigned',
    ...actorLog(access.actor),
    decision: 'Assigned',
    reason: `Assigned to ${assignee.full_name}`,
    createdAt: now,
    metadata: { assignee_id: assignee.id, assignee_name: assignee.full_name, assignee_email: assignee.email },
  })

  return NextResponse.json({ success: true })
}
