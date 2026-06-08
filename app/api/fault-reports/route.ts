import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const propertyId = user.app_metadata?.property_id as string | undefined
  if (!propertyId) return NextResponse.json({ error: 'No active property' }, { status: 400 })

  const body = await request.json()
  const {
    faultDescription,
    locationNotes,
    reportedByName,
    reportedByContact,
    urgency = 'medium',
    photoUrls = [],
    type = 'reactive',
    priority,
  } = body as {
    faultDescription?: string
    locationNotes?: string
    reportedByName?: string
    reportedByContact?: string
    urgency?: string
    photoUrls?: string[]
    type?: string
    priority?: string
  }

  if (!faultDescription?.trim()) {
    return NextResponse.json({ error: 'Fault description is required.' }, { status: 400 })
  }
  if (!reportedByName?.trim()) {
    return NextResponse.json({ error: 'Reported by name is required.' }, { status: 400 })
  }

  const service = await createServiceClient()

  // Generate WO number (REPT- prefix for fault reports)
  const woNumber = `REPT-${Date.now().toString(36).toUpperCase()}`

  // Create work order first
  const { data: wo, error: woErr } = await service
    .from('work_orders')
    .insert({
      property_id: propertyId,
      wo_number: woNumber,
      type,
      status: 'new_report',
      priority: priority ?? urgency,
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
      photo_urls: photoUrls,
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

  return NextResponse.json({ workOrderId: wo.id, woNumber }, { status: 201 })
}
