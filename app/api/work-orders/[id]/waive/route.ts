import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { syncTenant360WorkOrder } from '@/lib/monday/tenant360'
import { authorizeWorkOrderStaff } from '@/lib/work-order-access'
import { logWorkOrderEvent } from '@/lib/work-order-events'

interface Params {
  params: Promise<{ id: string }>
}

/** Waiving (and un-waiving) charges is a Property Manager decision (decision D8). */
const WAIVE_ROLES = ['property_manager']

async function authorizeWaive(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const

  const service = await createServiceClient()
  const { data: wo } = await service
    .from('work_orders')
    .select('id, property_id, is_cost_waived')
    .eq('id', id)
    .maybeSingle()

  if (!wo) return { error: NextResponse.json({ error: 'Work order not found.' }, { status: 404 }) } as const

  const access = await authorizeWorkOrderStaff(service, user, wo.property_id, { roles: WAIVE_ROLES })
  if (!access.ok) return { error: NextResponse.json({ error: access.error }, { status: access.status }) } as const

  return { service, wo, actor: access.actor } as const
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params
  const ctx = await authorizeWaive(id)
  if ('error' in ctx) return ctx.error
  const { service, actor } = ctx

  const body = await request.json().catch(() => ({})) as { reason?: string }
  const reason = body.reason?.trim() || null
  const now = new Date().toISOString()

  const { error } = await service
    .from('work_orders')
    .update({
      is_cost_waived: true,
      cost_waived_at: now,
      cost_waived_by_name: actor.name,
      cost_waived_reason: reason,
      updated_at: now,
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logWorkOrderEvent(service, id, {
    eventType: 'cost_waived',
    step: 'Charges waived',
    actorName: actor.name,
    actorEmail: actor.email,
    actorRole: actor.role,
    decision: 'Waived',
    reason,
    createdAt: now,
  })

  await syncTenant360WorkOrder(id)

  return NextResponse.json({ success: true })
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params
  const ctx = await authorizeWaive(id)
  if ('error' in ctx) return ctx.error
  const { service, actor } = ctx
  const now = new Date().toISOString()

  const { error } = await service
    .from('work_orders')
    .update({
      is_cost_waived: false,
      cost_waived_at: null,
      cost_waived_by_name: null,
      cost_waived_reason: null,
      updated_at: now,
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logWorkOrderEvent(service, id, {
    eventType: 'cost_waiver_removed',
    step: 'Charges waiver removed',
    actorName: actor.name,
    actorEmail: actor.email,
    actorRole: actor.role,
    decision: 'Waiver removed',
    createdAt: now,
  })

  await syncTenant360WorkOrder(id)

  return NextResponse.json({ success: true })
}
