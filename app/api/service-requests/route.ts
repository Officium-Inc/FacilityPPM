import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logWorkOrderEvent } from '@/lib/work-order-events'
import { resolveTenantSubmitter, sanitizeServiceReportPhotoUrls } from '@/lib/tenant-submit'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    slug,
    faultDescription,
    locationNotes,
    reportedByName,
    reportedByContact,
    tenantLessee,
    photoUrls = [],
  } = body as {
    slug?: string
    faultDescription?: string
    locationNotes?: string
    reportedByName?: string
    reportedByContact?: string
    tenantLessee?: string
    photoUrls?: unknown
  }

  if (!faultDescription?.trim()) {
    return NextResponse.json({ error: 'Description of work requested is required.' }, { status: 400 })
  }

  const service = await createServiceClient()
  const submitter = await resolveTenantSubmitter(service, user, slug)
  if (!submitter.ok) return NextResponse.json({ error: submitter.error }, { status: submitter.status })

  const { propertyId, engineer } = submitter
  const reportedByLabel = reportedByName?.trim() || engineer.full_name || user.email || 'Tenant'
  const contact = reportedByContact?.trim() || engineer.email || user.email || null
  const woNumber = `REPT-${Date.now().toString(36).toUpperCase()}`
  const photos = sanitizeServiceReportPhotoUrls(photoUrls, propertyId)

  // Priority is assessed by an engineer at inspection, so it starts empty.
  const { data: wo, error: woErr } = await service
    .from('work_orders')
    .insert({
      property_id: propertyId,
      requested_by_id: engineer.id,
      tenant_name: engineer.full_name || user.email || 'Tenant',
      tenant_email: engineer.email || user.email || null,
      wo_number: woNumber,
      type: 'reactive',
      status: 'new_report',
      priority: null,
    })
    .select('id')
    .single()

  if (woErr) return NextResponse.json({ error: woErr.message }, { status: 500 })

  const { data: report, error: reportErr } = await service
    .from('work_order_reports')
    .insert({
      work_order_id: wo.id,
      fault_description: faultDescription.trim(),
      location_notes: locationNotes?.trim() || null,
      reported_by_name: reportedByLabel,
      reported_by_contact: contact,
      tenant_lessee: tenantLessee?.trim() || null,
      urgency: null,
      photo_urls: photos,
    })
    .select('id')
    .single()

  if (reportErr) {
    await service.from('work_orders').delete().eq('id', wo.id)
    return NextResponse.json({ error: reportErr.message }, { status: 500 })
  }

  await service.from('work_orders').update({ report_id: report.id }).eq('id', wo.id)

  await logWorkOrderEvent(service, wo.id, {
    eventType: 'report_submitted',
    step: 'Service report submitted',
    actorName: reportedByLabel,
    actorEmail: engineer.email || user.email || null,
    actorRole: 'tenant',
    decision: 'Submitted',
    metadata: { photo_count: photos.length },
  })

  return NextResponse.json({ workOrderId: wo.id, woNumber }, { status: 201 })
}
