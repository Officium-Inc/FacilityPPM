import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { syncTenant360WorkOrder } from '@/lib/monday/tenant360'
import { authorizeWorkOrderStaff } from '@/lib/work-order-access'
import { isPriority } from '@/lib/priority'
import { logWorkOrderEvent } from '@/lib/work-order-events'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  const service = await createServiceClient()

  const { data: wo } = await service
    .from('work_orders')
    .select('id, status, property_id, wo_number')
    .eq('id', id)
    .single()

  if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })
  if (wo.status !== 'assigned') {
    return NextResponse.json({ error: 'Work order is not in assignment stage.' }, { status: 409 })
  }

  const access = await authorizeWorkOrderStaff(service, user, wo.property_id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const { actor } = access
  const headEngineer = actor.id ? { id: actor.id } : null

  const { data: assignee } = await service
    .from('engineers')
    .select('full_name, email')
    .eq('id', engineerId)
    .maybeSingle()

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
    actorName: actor.name,
    actorEmail: actor.email,
    actorRole: actor.role,
    decision: 'Assigned',
    reason: `Assigned to ${assignee?.full_name ?? 'service team member'}${dueDate ? `, due ${dueDate}` : ''}`,
    metadata: { assignee_name: assignee?.full_name ?? null, assignee_email: assignee?.email ?? null, due_date: dueDate ?? null },
  })

  await syncTenant360WorkOrder(id, { findExisting: true })

  return NextResponse.json({ success: true })
}
