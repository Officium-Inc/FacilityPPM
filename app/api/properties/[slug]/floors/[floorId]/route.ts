import { NextRequest, NextResponse } from 'next/server'
import { authorizeForSlug, requireSession } from '@/lib/authz/guard'

interface Params {
  params: Promise<{ slug: string; floorId: string }>
}

/** Renames, re-levels or reorders a floor (Administrators only, D4). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { slug, floorId } = await params
  const session = await requireSession()
  if (!session.ok) return session.response
  const { service } = session

  const access = await authorizeForSlug(session, slug, 'floors.manage')
  if (!access.ok) return access.response

  const body = await request.json().catch(() => ({})) as { label?: string; level?: number | string | null; sortOrder?: number }
  const updates: Record<string, unknown> = {}

  if (body.label !== undefined) {
    const label = body.label.trim()
    if (!label || label.length > 60) {
      return NextResponse.json({ error: 'Floor name is required (up to 60 characters).' }, { status: 400 })
    }
    updates.label = label
  }
  if (body.level !== undefined) {
    const level = body.level === null || body.level === '' ? null : Number(body.level)
    if (level !== null && !Number.isInteger(level)) {
      return NextResponse.json({ error: 'Level must be a whole number.' }, { status: 400 })
    }
    updates.level = level
  }
  if (body.sortOrder !== undefined) {
    if (!Number.isInteger(body.sortOrder)) return NextResponse.json({ error: 'Invalid order.' }, { status: 400 })
    updates.sort_order = body.sortOrder
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })

  const { data: floor, error } = await service
    .from('floors')
    .update(updates)
    .eq('id', floorId)
    .eq('property_id', access.propertyId)
    .select('*')
    .maybeSingle()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'A floor with this name already exists.' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!floor) return NextResponse.json({ error: 'Floor not found.' }, { status: 404 })

  return NextResponse.json({ floor })
}

/** Removes a floor. A floor with a current tenant must be vacated first (Administrators only, D4). */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { slug, floorId } = await params
  const session = await requireSession()
  if (!session.ok) return session.response
  const { service } = session

  const access = await authorizeForSlug(session, slug, 'floors.manage')
  if (!access.ok) return access.response

  const { data: floor } = await service
    .from('floors')
    .select('id')
    .eq('id', floorId)
    .eq('property_id', access.propertyId)
    .maybeSingle()
  if (!floor) return NextResponse.json({ error: 'Floor not found.' }, { status: 404 })

  const { data: current } = await service
    .from('floor_occupancies')
    .select('id')
    .eq('floor_id', floorId)
    .is('ends_on', null)
    .maybeSingle()
  if (current) {
    return NextResponse.json({ error: 'Remove the tenant from this floor before deleting it.' }, { status: 409 })
  }

  const { error } = await service.from('floors').delete().eq('id', floorId).eq('property_id', access.propertyId)
  if (error) {
    return NextResponse.json(
      { error: error.code === '23503' ? 'This floor is still referenced by work orders and cannot be deleted.' : error.message },
      { status: error.code === '23503' ? 409 : 500 }
    )
  }

  return NextResponse.json({ success: true })
}
