import { NextRequest, NextResponse } from 'next/server'
import { authorize, requireSession } from '@/lib/authz/guard'
import { actorEngineerId, actorLog } from '@/lib/authz/actor'
import { WORK_ORDER_SCOPE_COLUMNS } from '@/lib/authz/records'
import { sanitizeWorkOrderFileUrls } from '@/lib/work-order-files'
import { logWorkOrderEvent } from '@/lib/work-order-events'
import { syncTenant360WorkOrder } from '@/lib/monday/tenant360'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params

  const session = await requireSession()

  if (!session.ok) return session.response

  const body = await request.json()
  const {
    workDescription,
    completionPhotoUrls: rawPhotoUrls,
    supportingDocUrls: rawDocUrls,
    hoursLogged: rawHoursLogged,
  } = body as {
    workDescription?: string
    completionPhotoUrls?: unknown
    supportingDocUrls?: unknown
    hoursLogged?: unknown
  }

  if (!workDescription?.trim()) {
    return NextResponse.json({ error: 'Work description is required.' }, { status: 400 })
  }

  const { service } = session

  const { data: wo } = await service
    .from('work_orders')
    .select(`${WORK_ORDER_SCOPE_COLUMNS}, status, wo_number`)
    .eq('id', id)
    .single()

  if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })
  if (wo.status !== 'in_progress' && wo.status !== 'svc_submitted') {
    return NextResponse.json({ error: 'Work order is not in progress.' }, { status: 409 })
  }

  const access = await authorize(session, 'workRequest.execute', { record: wo })
  if (!access.ok) return access.response
  const { actor } = access

  const completionPhotoUrls = sanitizeWorkOrderFileUrls(rawPhotoUrls, wo.property_id, id)
  const supportingDocUrls = sanitizeWorkOrderFileUrls(rawDocUrls, wo.property_id, id)
  const hours = Number(rawHoursLogged)
  const hoursLogged = Number.isFinite(hours) && hours >= 0 && hours <= 10000 ? hours : null

  const now = new Date().toISOString()

  // Save completion evidence — try INSERT first, fall back to UPDATE on conflict
  const evidencePayload = {
    work_description: workDescription.trim(),
    completion_photo_urls: completionPhotoUrls,
    supporting_doc_urls: supportingDocUrls,
    submitted_by_id: actorEngineerId(actor),
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
    hours_logged: hoursLogged,
    updated_at: now,
  }).eq('id', id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  await logWorkOrderEvent(service, id, {
    eventType: 'work_submitted',
    step: 'Work execution',
    ...actorLog(actor),
    decision: 'Submitted for verification',
    reason: workDescription,
    createdAt: now,
    metadata: {
      hours_logged: hoursLogged,
      photo_count: completionPhotoUrls.length,
      document_count: supportingDocUrls.length,
    },
  })

  await syncTenant360WorkOrder(id)

  return NextResponse.json({ success: true })
}
