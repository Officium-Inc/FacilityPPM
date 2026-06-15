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

  const propertyId = user.app_metadata?.property_id as string | undefined
  if (!propertyId) return NextResponse.json({ error: 'No active property' }, { status: 400 })

  const body = await request.json() as { reason?: string; waivedByName?: string }
  const { reason, waivedByName } = body

  const service = await createServiceClient()

  const { data: wo } = await service
    .from('work_orders')
    .select('id, property_id, is_cost_waived')
    .eq('id', id)
    .single()

  if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })
  if (wo.property_id !== propertyId) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })

  const { error } = await service
    .from('work_orders')
    .update({
      is_cost_waived: true,
      cost_waived_at: new Date().toISOString(),
      cost_waived_by_name: waivedByName ?? null,
      cost_waived_reason: reason?.trim() ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const propertyId = user.app_metadata?.property_id as string | undefined
  if (!propertyId) return NextResponse.json({ error: 'No active property' }, { status: 400 })

  const service = await createServiceClient()

  const { data: wo } = await service
    .from('work_orders')
    .select('id, property_id')
    .eq('id', id)
    .single()

  if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })
  if (wo.property_id !== propertyId) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })

  const { error } = await service
    .from('work_orders')
    .update({
      is_cost_waived: false,
      cost_waived_at: null,
      cost_waived_by_name: null,
      cost_waived_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
