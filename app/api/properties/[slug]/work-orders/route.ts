import { NextRequest, NextResponse } from 'next/server'
import { authorizeForSlug, requireSession } from '@/lib/authz/guard'

interface Params {
  params: Promise<{ slug: string }>
}

/** Planned (PPM) work orders are created by staff. */
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params
  const session = await requireSession()
  if (!session.ok) return session.response
  const { service } = session

  const access = await authorizeForSlug(session, slug, 'maintenance.manage')
  if (!access.ok) return access.response
  const { propertyId } = access

  const body = await request.json() as {
    schedule_id?: string
    engineer_id?: string
    wo_number?: string
    type?: string
    status?: string
    scheduled_date?: string
    priority?: string
    notes?: string
  }

  if (!body.wo_number?.trim()) {
    return NextResponse.json({ error: 'WO number is required.' }, { status: 400 })
  }
  if (!body.scheduled_date) {
    return NextResponse.json({ error: 'Scheduled date is required.' }, { status: 400 })
  }

  // Referenced schedule and engineer must belong to this property
  if (body.schedule_id) {
    const { data: schedule } = await service
      .from('ppm_schedules')
      .select('id, assets!inner(buildings!inner(sites!inner(property_id)))')
      .eq('id', body.schedule_id)
      .eq('assets.buildings.sites.property_id', propertyId)
      .maybeSingle()
    if (!schedule) return NextResponse.json({ error: 'Schedule not found in this property.' }, { status: 400 })
  }
  if (body.engineer_id) {
    const { data: engineer } = await service
      .from('engineers')
      .select('id')
      .eq('id', body.engineer_id)
      .eq('property_id', propertyId)
      .eq('is_active', true)
      .maybeSingle()
    if (!engineer) return NextResponse.json({ error: 'Engineer not found in this property.' }, { status: 400 })
  }
  // Check WO number uniqueness
  const { data: existing } = await service
    .from('work_orders')
    .select('id')
    .eq('wo_number', body.wo_number.trim())
    .single()

  if (existing) {
    return NextResponse.json({ error: 'A work order with this number already exists.' }, { status: 409 })
  }

  const { data, error } = await service.from('work_orders').insert({
    property_id: propertyId,
    schedule_id: body.schedule_id || null,
    engineer_id: body.engineer_id || null,
    wo_number: body.wo_number.trim(),
    type: body.type ?? 'ppm',
    status: body.status ?? 'scheduled',
    scheduled_date: body.scheduled_date,
    priority: body.priority ?? 'medium',
    notes: body.notes?.trim() || null,
  }).select('id').single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: data.id }, { status: 201 })
}
