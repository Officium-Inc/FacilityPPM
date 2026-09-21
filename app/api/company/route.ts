import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { normalizeRoleName } from '@/lib/roles'

const MANAGE_ROLES = ['admin', 'property_manager']

// PATCH: update the active property's company profile (admin/property manager only)
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const propertyId = user.app_metadata?.property_id as string | undefined
  const isProvider = user.app_metadata?.role === 'provider'
  if (!propertyId && !isProvider) {
    return NextResponse.json({ error: 'No active property' }, { status: 400 })
  }

  const service = await createServiceClient()

  if (!isProvider) {
    const { data: eng } = await service
      .from('engineers')
      .select('roles(name)')
      .eq('property_id', propertyId!)
      .eq('user_id', user.id)
      .maybeSingle()
    const roleName = normalizeRoleName((eng?.roles as unknown as { name: string } | null)?.name)
    if (!MANAGE_ROLES.includes(roleName ?? '')) {
      return NextResponse.json({ error: 'Only admins and property managers can update the company profile.' }, { status: 403 })
    }
  }

  const body = await request.json() as {
    name?: string
    address?: string
    city?: string
    country?: string
    contact_email?: string
    contact_phone?: string
    website?: string
  }

  if (body.name !== undefined && !body.name.trim()) {
    return NextResponse.json({ error: 'Company name cannot be empty.' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name.trim()
  for (const key of ['address', 'city', 'country', 'contact_email', 'contact_phone', 'website'] as const) {
    if (body[key] !== undefined) updates[key] = body[key]?.trim() || null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { error } = await service.from('properties').update(updates).eq('id', propertyId!)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
