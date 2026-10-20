import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { authorizeWorkOrderStaff } from '@/lib/work-order-access'
import { logWorkOrderEvent } from '@/lib/work-order-events'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { engineerId } = await request.json() as { engineerId?: string }
  if (!engineerId) return NextResponse.json({ error: 'Please select a service team member.' }, { status: 400 })

  const service = await createServiceClient()

  const { data: wo } = await service
    .from('work_orders')
    .select('id, status, property_id')
    .eq('id', id)
    .single()

  if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })
  if (wo.status !== 'new_report') {
    return NextResponse.json({ error: 'Work order is not awaiting an inspection team.' }, { status: 409 })
  }

  const access = await authorizeWorkOrderStaff(service, user, wo.property_id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const { data: assignee } = await service
    .from('engineers')
    .select('id, full_name, email')
    .eq('id', engineerId)
    .eq('property_id', wo.property_id)
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
    actorName: access.actor.name,
    actorEmail: access.actor.email,
    actorRole: access.actor.role,
    decision: 'Assigned',
    reason: `Assigned to ${assignee.full_name}`,
    createdAt: now,
    metadata: { assignee_id: assignee.id, assignee_name: assignee.full_name, assignee_email: assignee.email },
  })

  return NextResponse.json({ success: true })
}
