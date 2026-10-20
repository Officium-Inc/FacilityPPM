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
    legal_name?: string
    address?: string
    city?: string
    country?: string
    contact_email?: string
    contact_phone?: string
    fax?: string
    website?: string
    work_order_terms?: string
  }

  if (body.name !== undefined && !body.name.trim()) {
    return NextResponse.json({ error: 'Company name cannot be empty.' }, { status: 400 })
  }

  // Fields added in migration 018: only write blanks when the column exists, so saving the
  // rest of the profile keeps working on databases that have not been migrated yet.
  const newColumns = new Set(['legal_name', 'fax', 'work_order_terms'])
  const { data: current } = await service.from('properties').select('*').eq('id', propertyId!).maybeSingle()

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name.trim()
  for (const key of ['legal_name', 'address', 'city', 'country', 'contact_email', 'contact_phone', 'fax', 'website', 'work_order_terms'] as const) {
    if (body[key] === undefined) continue
    const value = body[key]?.trim() || null
    if (value === null && newColumns.has(key) && !(current && key in current)) continue
    updates[key] = value
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { error } = await service.from('properties').update(updates).eq('id', propertyId!)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
