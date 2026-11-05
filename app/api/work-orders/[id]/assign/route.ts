import { NextRequest, NextResponse } from 'next/server'
import { authorize, requireSession } from '@/lib/authz/guard'
import { actorEngineerId, actorLog } from '@/lib/authz/actor'
import { WORK_ORDER_SCOPE_COLUMNS } from '@/lib/authz/records'
import { syncTenant360WorkOrder } from '@/lib/monday/tenant360'
import { isPriority } from '@/lib/priority'
import { logWorkOrderEvent } from '@/lib/work-order-events'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params

  const session = await requireSession()

  if (!session.ok) return session.response

  const body = await request.json()
  const {
    engineerId,
    dueDate,
    instructions,
    priority,
  } = body as {
    engineerId?: string
    dueDate?: string
    instructions?: string
    priority?: string
  }

  if (!engineerId) {
    return NextResponse.json({ error: 'Engineer is required.' }, { status: 400 })
  }

  const { service } = session

  const { data: wo } = await service
    .from('work_orders')
    .select(`${WORK_ORDER_SCOPE_COLUMNS}, status, wo_number`)
    .eq('id', id)
    .single()

  if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })
  if (wo.status !== 'assigned') {
    return NextResponse.json({ error: 'Work order is not in assignment stage.' }, { status: 409 })
  }

  const access = await authorize(session, 'workRequest.assign', { record: wo })
  if (!access.ok) return access.response
  const { actor } = access
  const headEngineer = actorEngineerId(actor) ? { id: actorEngineerId(actor) } : null

  const { data: assignee } = await service
    .from('engineers')
    .select('full_name, email')
    .eq('id', engineerId)
    .eq('property_id', wo.property_id)
    .eq('is_active', true)
    .maybeSingle()

  if (!assignee) return NextResponse.json({ error: 'Engineer not found in this property.' }, { status: 400 })

  // Rename REPT- number to proper WO- number on first assignment
  const isReactiveReport = (wo.wo_number as string).startsWith('REPT-')
  const newWoNumber = isReactiveReport
    ? (wo.wo_number as string).replace(/^REPT-/, 'WO-')
    : undefined

  const { error } = await service.from('work_orders').update({
    engineer_id: engineerId,
    head_engineer_id: headEngineer?.id ?? null,
    due_date: dueDate ?? null,
    assignment_instructions: instructions?.trim() ?? null,
    priority: isPriority(priority) ? priority : undefined,
    status: 'in_progress',
    ...(newWoNumber ? { wo_number: newWoNumber } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Store original WO number for audit trail — non-blocking, requires migration 009
  if (newWoNumber) {
    void service.from('work_orders')
      .update({ original_wo_number: wo.wo_number } as Record<string, unknown>)
      .eq('id', id)
  }

  await logWorkOrderEvent(service, id, {
    eventType: 'assigned',
    step: 'Assignment',
    ...actorLog(actor),
    decision: 'Assigned',
    reason: `Assigned to ${assignee?.full_name ?? 'service team member'}${dueDate ? `, due ${dueDate}` : ''}`,
    metadata: { assignee_name: assignee?.full_name ?? null, assignee_email: assignee?.email ?? null, due_date: dueDate ?? null },
  })

  await syncTenant360WorkOrder(id, { findExisting: true })

  return NextResponse.json({ success: true })
}
