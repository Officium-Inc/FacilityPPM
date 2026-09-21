import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// PATCH: update the current user's own profile (name, phone, password)
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    full_name?: string
    phone?: string
    new_password?: string
  }

  if (body.full_name !== undefined && !body.full_name.trim()) {
    return NextResponse.json({ error: 'Full name cannot be empty.' }, { status: 400 })
  }
  if (body.new_password !== undefined && body.new_password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  const fullName = body.full_name?.trim()

  // Update auth user (metadata + optional password) via the user's own session
  if (fullName || body.new_password) {
    const { error: authErr } = await supabase.auth.updateUser({
      ...(body.new_password ? { password: body.new_password } : {}),
      ...(fullName ? { data: { full_name: fullName } } : {}),
    })
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })
  }

  // Update the engineer record for the active property, if one exists
  const propertyId = user.app_metadata?.property_id as string | undefined
  if (propertyId && (fullName !== undefined || body.phone !== undefined)) {
    const service = await createServiceClient()
    const updates: Record<string, unknown> = {}
    if (fullName) updates.full_name = fullName
    if (body.phone !== undefined) updates.phone = body.phone?.trim() || null

    const { error } = await service
      .from('engineers')
      .update(updates)
      .eq('property_id', propertyId)
      .eq('user_id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
