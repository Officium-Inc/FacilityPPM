import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const propertyId = user.app_metadata?.property_id as string | undefined
  if (!propertyId) return NextResponse.json({ error: 'No active property' }, { status: 400 })

  const body = await request.json() as {
    full_name?: string
    email?: string
    phone?: string
    role_id?: string
    certifications?: string
  }

  if (!body.full_name?.trim()) {
    return NextResponse.json({ error: 'Full name is required.' }, { status: 400 })
  }
  if (!body.email?.trim()) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  }

  const service = await createServiceClient()

  // Check duplicate within this property
  const { data: dupe } = await service
    .from('engineers')
    .select('id')
    .eq('property_id', propertyId)
    .eq('email', body.email.trim().toLowerCase())
    .single()

  if (dupe) {
    return NextResponse.json({ error: 'An engineer with this email already exists in this property.' }, { status: 409 })
  }

  const { data, error } = await service.from('engineers').insert({
    property_id: propertyId,
    full_name: body.full_name.trim(),
    email: body.email.trim().toLowerCase(),
    phone: body.phone?.trim() || null,
    role_id: body.role_id || null,
    certifications: body.certifications?.trim() || null,
    is_active: true,
  }).select('id').single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: data.id }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const propertyId = user.app_metadata?.property_id as string | undefined
  if (!propertyId) return NextResponse.json({ error: 'No active property' }, { status: 400 })

  const body = await request.json() as {
    id?: string
    role_id?: string
    is_active?: boolean
    phone?: string
    certifications?: string
  }

  if (!body.id) return NextResponse.json({ error: 'Engineer id is required.' }, { status: 400 })

  const service = await createServiceClient()

  // Verify engineer belongs to this property
  const { data: eng } = await service
    .from('engineers')
    .select('id')
    .eq('id', body.id)
    .eq('property_id', propertyId)
    .single()

  if (!eng) return NextResponse.json({ error: 'Engineer not found.' }, { status: 404 })

  const updates: Record<string, unknown> = {}
  if (body.role_id !== undefined) updates.role_id = body.role_id || null
  if (body.is_active !== undefined) updates.is_active = body.is_active
  if (body.phone !== undefined) updates.phone = body.phone?.trim() || null
  if (body.certifications !== undefined) updates.certifications = body.certifications?.trim() || null

  const { error } = await service.from('engineers').update(updates).eq('id', body.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
