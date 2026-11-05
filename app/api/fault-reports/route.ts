import { NextRequest, NextResponse } from 'next/server'
import { logWorkOrderEvent } from '@/lib/work-order-events'
import { authorize, requireSession } from '@/lib/authz/guard'
import { actorLog } from '@/lib/authz/actor'
import { isPriority } from '@/lib/priority'
import { resolveRequestFloor } from '@/lib/floors'

/** Staff record a service report on behalf of a tenant. Tenants use /api/service-requests. */
const WORK_ORDER_TYPES = ['ppm', 'reactive', 'statutory', 'project']

export async function POST(request: NextRequest) {
  const session = await requireSession()
  if (!session.ok) return session.response
  const { user, service } = session

  const propertyId = user.app_metadata?.property_id as string | undefined
  if (!propertyId) return NextResponse.json({ error: 'No active property' }, { status: 400 })

  const access = await authorize(session, 'workRequest.submitOnBehalf', { propertyId })
  if (!access.ok) return access.response
  const { actor } = access

  const body = await request.json()
  const {
    faultDescription,
    locationNotes,
    reportedByName,
    reportedByContact,
    urgency: rawUrgency,
    type: rawType,
    priority: rawPriority,
    companyId: rawCompanyId,
    floorId: rawFloorId,
  } = body as {
    faultDescription?: string
    locationNotes?: string
    reportedByName?: string
    reportedByContact?: string
    urgency?: string
    type?: string
    priority?: string
    companyId?: string
    floorId?: string
  }

  if (!faultDescription?.trim()) {
    return NextResponse.json({ error: 'Fault description is required.' }, { status: 400 })
  }
  if (!reportedByName?.trim()) {
    return NextResponse.json({ error: 'Reported by name is required.' }, { status: 400 })
  }

  const urgency = isPriority(rawUrgency) ? rawUrgency : 'medium'
  const priority = isPriority(rawPriority) ? rawPriority : urgency
  const type = rawType && WORK_ORDER_TYPES.includes(rawType) ? rawType : 'reactive'

  // On-behalf reports name the tenant company (and floor) so the company sees them in its portal
  let companyId: string | null = null
  let floorId: string | null = null
  if (rawCompanyId) {
    const { data: company } = await service
      .from('tenant_companies')
      .select('id')
      .eq('id', rawCompanyId)
      .eq('property_id', propertyId)
      .eq('is_active', true)
      .maybeSingle()
    if (!company) return NextResponse.json({ error: 'Company not found in this property.' }, { status: 400 })
    const floor = await resolveRequestFloor(service, propertyId, company.id as string, rawFloorId)
    if (!floor.ok) return NextResponse.json({ error: floor.error }, { status: 400 })
    companyId = company.id as string
    floorId = floor.floorId
  }

  // Generate WO number (REPT- prefix for fault reports)
  const woNumber = `REPT-${Date.now().toString(36).toUpperCase()}`

  // Create work order first
  const { data: wo, error: woErr } = await service
    .from('work_orders')
    .insert({
      property_id: propertyId,
      company_id: companyId,
      floor_id: floorId,
      wo_number: woNumber,
      type,
      status: 'new_report',
      priority,
    })
    .select('id')
    .single()

  if (woErr) return NextResponse.json({ error: woErr.message }, { status: 500 })

  // Create fault report linked to the WO
  const { data: report, error: reportErr } = await service
    .from('work_order_reports')
    .insert({
      work_order_id: wo.id,
      fault_description: faultDescription.trim(),
      location_notes: locationNotes?.trim() ?? null,
      reported_by_name: reportedByName.trim(),
      reported_by_contact: reportedByContact?.trim() ?? null,
      urgency,
      photo_urls: [],
    })
    .select('id')
    .single()

  if (reportErr) {
    // Roll back WO
    await service.from('work_orders').delete().eq('id', wo.id)
    return NextResponse.json({ error: reportErr.message }, { status: 500 })
  }

  // Link report_id back to WO
  await service.from('work_orders').update({ report_id: report.id }).eq('id', wo.id)

  await logWorkOrderEvent(service, wo.id, {
    eventType: 'report_submitted',
    step: 'Service report submitted',
    ...actorLog(actor),
    decision: 'Submitted',
    metadata: { reported_by: reportedByName.trim() },
  })

  return NextResponse.json({ workOrderId: wo.id, woNumber }, { status: 201 })
}
