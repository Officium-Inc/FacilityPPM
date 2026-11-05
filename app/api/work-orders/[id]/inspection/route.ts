import { NextRequest, NextResponse } from 'next/server'
import { authorize, requireSession } from '@/lib/authz/guard'
import { actorEngineerId, actorLog } from '@/lib/authz/actor'
import { WORK_ORDER_SCOPE_COLUMNS } from '@/lib/authz/records'
import { sanitizeWorkOrderFileUrls } from '@/lib/work-order-files'
import { isPriority, priorityLabel } from '@/lib/priority'
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
    inspectionNotes,
    rootCause,
    scopeOfWork,
    inspectionPhotoUrls: rawInspectionPhotoUrls,
    outcome = 'proceed',
    priority,
    contractorName,
    contractorContact,
    contractorNotes,
  } = body as {
    inspectionNotes?: string
    rootCause?: string
    scopeOfWork?: string
    inspectionPhotoUrls?: unknown
    outcome?: 'proceed' | 'third_party'
    priority?: string
    contractorName?: string
    contractorContact?: string
    contractorNotes?: string
  }

  if (outcome !== 'proceed' && outcome !== 'third_party') {
    return NextResponse.json({ error: 'Invalid inspection outcome.' }, { status: 400 })
  }
  if (!inspectionNotes?.trim()) {
    return NextResponse.json({ error: 'Inspection notes are required.' }, { status: 400 })
  }
  if (!isPriority(priority)) {
    return NextResponse.json({ error: 'Please assess the priority of this report.' }, { status: 400 })
  }
  if (outcome === 'third_party' && !contractorName?.trim()) {
    return NextResponse.json({ error: 'Third-party contractor name is required.' }, { status: 400 })
  }

  const { service } = session

  // Verify WO exists and is in inspecting state
  const { data: wo } = await service
    .from('work_orders')
    .select(`${WORK_ORDER_SCOPE_COLUMNS}, status, report_id`)
    .eq('id', id)
    .single()

  if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })
  if (wo.status !== 'new_report' && wo.status !== 'inspecting') {
    return NextResponse.json({ error: 'Work order is not in inspection stage.' }, { status: 409 })
  }

  // Staff, or the Service Group member assigned to inspect it (decision D20)
  const access = await authorize(session, 'workRequest.inspect', { record: wo })
  if (!access.ok) return access.response
  const { actor } = access
  const inspectionPhotoUrls = sanitizeWorkOrderFileUrls(rawInspectionPhotoUrls, wo.property_id, id)

  const now = new Date().toISOString()
  const isThirdParty = outcome === 'third_party'

  // Update the work_order_reports record with inspection findings and the assessed priority
  if (wo.report_id) {
    await service.from('work_order_reports').update({
      inspection_notes: inspectionNotes.trim(),
      root_cause: rootCause?.trim() || null,
      scope_of_work: scopeOfWork?.trim() || null,
      inspection_photo_urls: inspectionPhotoUrls,
      urgency: priority,
      inspected_by_id: actorEngineerId(actor),
      inspected_at: now,
    }).eq('id', wo.report_id)
  }

  // Advance WO to costing stage
  const { error } = await service.from('work_orders').update({
    status: 'costing',
    priority,
    execution_mode: isThirdParty ? 'third_party' : 'in_house',
    contractor_name: isThirdParty ? contractorName!.trim() : null,
    contractor_contact: isThirdParty ? contractorContact?.trim() || null : null,
    contractor_notes: isThirdParty ? contractorNotes?.trim() || null : null,
    updated_at: now,
  }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logWorkOrderEvent(service, id, {
    eventType: 'inspection_completed',
    step: 'Inspection',
    ...actorLog(actor),
    decision: isThirdParty ? 'Third-party contractor' : 'In-house',
    reason: inspectionNotes,
    createdAt: now,
    metadata: {
      priority,
      priority_label: priorityLabel(priority),
      execution_mode: isThirdParty ? 'third_party' : 'in_house',
      contractor_name: isThirdParty ? contractorName!.trim() : null,
      contractor_contact: isThirdParty ? contractorContact?.trim() || null : null,
    },
  })

  return NextResponse.json({ success: true })
}
