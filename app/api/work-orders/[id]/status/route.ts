import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { authorizeWorkOrderStaff } from '@/lib/work-order-access'
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

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { status?: string }
  const nextStatus = body.status ?? ''

  const service = await createServiceClient()
  const { data: wo } = await service
    .from('work_orders')
    .select('id, status, property_id')
    .eq('id', id)
    .maybeSingle()

  if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })

  const access = await authorizeWorkOrderStaff(service, user, wo.property_id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

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
    actorName: access.actor.name,
    actorEmail: access.actor.email,
    actorRole: access.actor.role,
    decision: nextStatus,
    createdAt: now,
    metadata: { from: wo.status, to: nextStatus },
  })

  return NextResponse.json({ success: true })
}
