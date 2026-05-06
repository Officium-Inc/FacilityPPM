import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const propertyId = user.app_metadata?.property_id as string | undefined
  if (!propertyId) return NextResponse.json({ error: 'No active property' }, { status: 400 })

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

  const service = await createServiceClient()

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
