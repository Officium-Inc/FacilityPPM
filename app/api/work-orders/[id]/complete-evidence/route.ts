import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { authorizeWorkOrderStaff } from '@/lib/work-order-access'
import { logWorkOrderEvent } from '@/lib/work-order-events'
import { syncTenant360WorkOrder } from '@/lib/monday/tenant360'

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
    workDescription,
    completionPhotoUrls = [],
    supportingDocUrls = [],
    hoursLogged,
  } = body as {
    workDescription?: string
    completionPhotoUrls?: string[]
    supportingDocUrls?: string[]
    hoursLogged?: number
  }

  if (!workDescription?.trim()) {
    return NextResponse.json({ error: 'Work description is required.' }, { status: 400 })
  }

  const service = await createServiceClient()

  const { data: wo } = await service
    .from('work_orders')
    .select('id, status, wo_number, property_id')
    .eq('id', id)
    .single()

  if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })
  if (wo.status !== 'in_progress' && wo.status !== 'svc_submitted') {
    return NextResponse.json({ error: 'Work order is not in progress.' }, { status: 409 })
  }

  const access = await authorizeWorkOrderStaff(service, user, wo.property_id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const { actor } = access

  const now = new Date().toISOString()

  // Save completion evidence — try INSERT first, fall back to UPDATE on conflict
  const evidencePayload = {
    work_description: workDescription.trim(),
    completion_photo_urls: completionPhotoUrls,
    supporting_doc_urls: supportingDocUrls,
    submitted_by_id: actor.id,
    submitted_at: now,
  }

  const { error: insertErr } = await service
    .from('work_order_completion_evidence')
    .insert({ work_order_id: id, ...evidencePayload })

  if (insertErr) {
    // If a record already exists, update it
    const { error: updateErr } = await service
      .from('work_order_completion_evidence')
      .update(evidencePayload)
      .eq('work_order_id', id)

    if (updateErr) {
      console.error('[complete-evidence] failed to save evidence:', updateErr)
      return NextResponse.json({ error: 'Failed to save completion evidence.' }, { status: 500 })
    }
  }

  // The head engineer verifies the work first; the tenant sign-off link is only sent after that.
  const { error: updateErr } = await service.from('work_orders').update({
    status: 'svc_submitted',
    hours_logged: hoursLogged ?? null,
    updated_at: now,
  }).eq('id', id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  await logWorkOrderEvent(service, id, {
    eventType: 'work_submitted',
    step: 'Work execution',
    actorName: actor.name,
    actorEmail: actor.email,
    actorRole: actor.role,
    decision: 'Submitted for verification',
    reason: workDescription,
    createdAt: now,
    metadata: {
      hours_logged: hoursLogged ?? null,
      photo_count: completionPhotoUrls.length,
      document_count: supportingDocUrls.length,
    },
  })

  await syncTenant360WorkOrder(id)

  return NextResponse.json({ success: true })
}
