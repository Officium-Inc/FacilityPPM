import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { normalizeRoleName } from '@/lib/roles'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Resolve a role name to a role_id, creating the role if it doesn't exist */
async function resolveRoleId(service: SupabaseClient, roleName: string): Promise<string | null> {
  const normalizedRoleName = normalizeRoleName(roleName)
  if (!normalizedRoleName) return null
  const { data: existing } = await service
    .from('roles')
    .select('id')
    .ilike('name', normalizedRoleName)
    .limit(1)
    .maybeSingle()
  if (existing) return existing.id
  const { data: created } = await service
    .from('roles')
    .insert({ name: normalizedRoleName })
    .select('id')
    .single()
  return created?.id ?? null
}

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
    role_name?: string
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

  const roleId = body.role_name ? await resolveRoleId(service, body.role_name) : null

  const { data, error } = await service.from('engineers').insert({
    property_id: propertyId,
    full_name: body.full_name.trim(),
    email: body.email.trim().toLowerCase(),
    phone: body.phone?.trim() || null,
    role_id: roleId,
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
    role_name?: string
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
  if (body.role_name !== undefined) {
    updates.role_id = body.role_name ? await resolveRoleId(service, body.role_name) : null
  }
  if (body.is_active !== undefined) updates.is_active = body.is_active
  if (body.phone !== undefined) updates.phone = body.phone?.trim() || null
  if (body.certifications !== undefined) updates.certifications = body.certifications?.trim() || null

  const { error } = await service.from('engineers').update(updates).eq('id', body.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const propertyId = user.app_metadata?.property_id as string | undefined
  if (!propertyId) return NextResponse.json({ error: 'No active property' }, { status: 400 })

  const body = await request.json() as { id?: string }
  if (!body.id) return NextResponse.json({ error: 'Engineer id is required.' }, { status: 400 })

  const service = await createServiceClient()

  // Verify engineer belongs to this property before deleting
  const { data: eng } = await service
    .from('engineers')
    .select('id')
    .eq('id', body.id)
    .eq('property_id', propertyId)
    .single()

  if (!eng) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })

  const { error } = await service.from('engineers').delete().eq('id', body.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
