import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { authorizeWorkOrderStaff } from '@/lib/work-order-access'
import { logWorkOrderEvent } from '@/lib/work-order-events'
import { sendCancellationEmail } from '@/lib/email'
import { syncTenant360WorkOrder } from '@/lib/monday/tenant360'

interface Params {
  params: Promise<{ id: string }>
}

const CANCELLABLE_STATUSES = ['inspecting', 'costing', 'pending_approval']

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reason } = await request.json() as { reason?: string }
  if (!reason?.trim()) {
    return NextResponse.json({ error: 'A cancellation reason is required.' }, { status: 400 })
  }

  const service = await createServiceClient()

  const { data: wo } = await service
    .from('work_orders')
    .select('id, status, wo_number, property_id, requested_by_id, tenant_name, tenant_email, properties(name, slug)')
    .eq('id', id)
    .single()

  if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })
  if (!CANCELLABLE_STATUSES.includes(wo.status)) {
    return NextResponse.json(
      { error: 'A request can only be cancelled during inspection or costing.' },
      { status: 409 }
    )
  }

  const access = await authorizeWorkOrderStaff(service, user, wo.property_id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const { actor } = access

  const stage = wo.status === 'inspecting' ? 'inspection' : 'costing'
  const cleanReason = reason.trim()
  const now = new Date().toISOString()

  // Clearing the tokens also invalidates any cost approval link already sent to the tenant
  const { error } = await service.from('work_orders').update({
    status: 'cancelled',
    cancelled_at: now,
    cancelled_by_name: actor.name,
    cancellation_reason: cleanReason,
    cancelled_stage: stage,
    costing_token: null,
    costing_token_expires_at: null,
    sign_off_token: null,
    sign_off_expires_at: null,
    updated_at: now,
  }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logWorkOrderEvent(service, id, {
    eventType: 'cancelled',
    step: stage === 'costing' ? 'Costing cancelled' : 'Request cancelled at inspection',
    actorName: actor.name,
    actorEmail: actor.email,
    actorRole: actor.role,
    decision: 'Cancelled',
    reason: cleanReason,
    createdAt: now,
    metadata: { stage },
  })

  const property = wo.properties as { name?: string; slug?: string } | { name?: string; slug?: string }[] | null
  const propertyInfo = Array.isArray(property) ? property[0] : property

  if (wo.requested_by_id) {
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

  if (wo.tenant_email) {
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
