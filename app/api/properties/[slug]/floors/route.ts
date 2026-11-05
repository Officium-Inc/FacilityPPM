import { NextRequest, NextResponse } from 'next/server'
import { authorizeForSlug, requireSession } from '@/lib/authz/guard'

interface Params {
  params: Promise<{ slug: string }>
}

/** Adds a floor to the property (Administrators only, D4). */
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params
  const session = await requireSession()
  if (!session.ok) return session.response
  const { service } = session

  const access = await authorizeForSlug(session, slug, 'floors.manage')
  if (!access.ok) return access.response
  const { propertyId } = access

  const body = await request.json().catch(() => ({})) as { label?: string; level?: number | string | null; buildingId?: string | null }
  const label = body.label?.trim() ?? ''
  if (!label || label.length > 60) {
    return NextResponse.json({ error: 'Floor name is required (up to 60 characters).' }, { status: 400 })
  }

  const level = body.level === null || body.level === undefined || body.level === '' ? null : Number(body.level)
  if (level !== null && !Number.isInteger(level)) {
    return NextResponse.json({ error: 'Level must be a whole number.' }, { status: 400 })
  }

  let buildingId: string | null = null
  if (body.buildingId) {
    const { data: building } = await service
      .from('buildings')
      .select('id, sites!inner(property_id)')
      .eq('id', body.buildingId)
      .eq('sites.property_id', propertyId)
      .maybeSingle()
    if (!building) return NextResponse.json({ error: 'Building not found in this property.' }, { status: 400 })
    buildingId = building.id as string
  }

  const { data: last } = await service
    .from('floors')
    .select('sort_order')
    .eq('property_id', propertyId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: floor, error } = await service
    .from('floors')
    .insert({
      property_id: propertyId,
      building_id: buildingId,
      label,
      level,
      sort_order: ((last?.sort_order as number | undefined) ?? 0) + 1,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'A floor with this name already exists.' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ floor }, { status: 201 })
}

/** Reorders the property's floors; `order` lists every floor id in display order (Administrators only, D4). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { slug } = await params
  const session = await requireSession()
  if (!session.ok) return session.response
  const { service } = session

  const access = await authorizeForSlug(session, slug, 'floors.manage')
  if (!access.ok) return access.response
  const { propertyId } = access

  const body = await request.json().catch(() => ({})) as { order?: unknown }
  const order = Array.isArray(body.order) ? body.order : null
  if (!order || order.length === 0 || !order.every((id) => typeof id === 'string') || new Set(order).size !== order.length) {
    return NextResponse.json({ error: 'Invalid floor order.' }, { status: 400 })
  }

  const { data: rows, error: loadError } = await service.from('floors').select('id').eq('property_id', propertyId)
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 })
  const known = new Set((rows ?? []).map((row) => row.id as string))
  if (known.size !== order.length || !order.every((id) => known.has(id as string))) {
    return NextResponse.json({ error: 'The floor list changed. Refresh and try again.' }, { status: 409 })
  }

  const results = await Promise.all(
    (order as string[]).map((id, index) =>
      service.from('floors').update({ sort_order: index + 1 }).eq('id', id).eq('property_id', propertyId)
    )
  )
  const failed = results.find((result) => result.error)
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
