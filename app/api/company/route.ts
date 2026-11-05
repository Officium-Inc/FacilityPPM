import { NextRequest, NextResponse } from 'next/server'
import { authorize, requireSession } from '@/lib/authz/guard'

// PATCH: update the active property's company profile (Administrators and Property Managers)
export async function PATCH(request: NextRequest) {
  const session = await requireSession()
  if (!session.ok) return session.response
  const { user, service } = session

  const propertyId = user.app_metadata?.property_id as string | undefined
  if (!propertyId) return NextResponse.json({ error: 'No active property' }, { status: 400 })

  const access = await authorize(session, 'property.profile.edit', { propertyId })
  if (!access.ok) return access.response

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
  const { data: current } = await service.from('properties').select('*').eq('id', propertyId).maybeSingle()

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

  const { error } = await service.from('properties').update(updates).eq('id', propertyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
