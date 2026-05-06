import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const propertyId = user.app_metadata?.property_id as string | undefined
  if (!propertyId) return NextResponse.json({ error: 'No active property' }, { status: 400 })

  const body = await request.json() as {
    building_id?: string
    name?: string
    category?: string
    make?: string
    model?: string
    serial_no?: string
    location?: string
    install_date?: string
    warranty_expiry?: string
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Asset name is required.' }, { status: 400 })
  }
  if (!body.building_id) {
    return NextResponse.json({ error: 'Building is required.' }, { status: 400 })
  }

  const service = await createServiceClient()

  // Verify the building belongs to this property (security check)
  const { data: building } = await service
    .from('buildings')
    .select('id, sites!inner(property_id)')
    .eq('id', body.building_id)
    .single()

  const sitePropertyId = (building?.sites as unknown as { property_id: string } | null)?.property_id
  if (!building || sitePropertyId !== propertyId) {
    return NextResponse.json({ error: 'Building not found in this property.' }, { status: 404 })
  }

  const { data, error } = await service.from('assets').insert({
    building_id: body.building_id,
    name: body.name.trim(),
    category: body.category?.trim() || null,
    make: body.make?.trim() || null,
    model: body.model?.trim() || null,
    serial_no: body.serial_no?.trim() || null,
    location: body.location?.trim() || null,
    install_date: body.install_date || null,
    warranty_expiry: body.warranty_expiry || null,
    status: 'active',
  }).select('id').single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: data.id }, { status: 201 })
}
