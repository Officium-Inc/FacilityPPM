import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

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
    inspectionNotes,
    rootCause,
    scopeOfWork,
    inspectionPhotoUrls = [],
  } = body as {
    inspectionNotes?: string
    rootCause?: string
    scopeOfWork?: string
    inspectionPhotoUrls?: string[]
  }

  if (!inspectionNotes?.trim()) {
    return NextResponse.json({ error: 'Inspection notes are required.' }, { status: 400 })
  }

  const service = await createServiceClient()

  // Verify WO exists and is in inspecting state
  const { data: wo } = await service
    .from('work_orders')
    .select('id, status, report_id, property_id')
    .eq('id', id)
    .single()

  if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })
  if (wo.status !== 'new_report' && wo.status !== 'inspecting') {
    return NextResponse.json({ error: 'Work order is not in inspection stage.' }, { status: 409 })
  }

  // Resolve engineer id from user
  const { data: engineer } = await service
    .from('engineers')
    .select('id')
    .eq('user_id', user.id)
    .eq('property_id', wo.property_id)
    .maybeSingle()

  const now = new Date().toISOString()

  // Update the work_order_reports record with inspection findings
  if (wo.report_id) {
    await service.from('work_order_reports').update({
      inspection_notes: inspectionNotes.trim(),
      root_cause: rootCause?.trim() ?? null,
      scope_of_work: scopeOfWork?.trim() ?? null,
      inspection_photo_urls: inspectionPhotoUrls,
      inspected_by_id: engineer?.id ?? null,
      inspected_at: now,
    }).eq('id', wo.report_id)
  }

  // Advance WO to costing stage
  const { error } = await service.from('work_orders').update({
    status: 'costing',
    updated_at: now,
  }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
