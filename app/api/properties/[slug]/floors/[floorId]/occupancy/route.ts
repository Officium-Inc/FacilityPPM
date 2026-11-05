import { NextRequest, NextResponse } from 'next/server'
import { authorizeForSlug, requireSession } from '@/lib/authz/guard'

interface Params {
  params: Promise<{ slug: string; floorId: string }>
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

/** Sets the tenant company for a vacant floor (Administrators only, D4). */
export async function POST(request: NextRequest, { params }: Params) {
  const { slug, floorId } = await params
  const session = await requireSession()
  if (!session.ok) return session.response
  const { service } = session

  const access = await authorizeForSlug(session, slug, 'floors.manage')
  if (!access.ok) return access.response
  const { propertyId } = access

  const body = await request.json().catch(() => ({})) as { companyId?: string }
  if (!body.companyId) return NextResponse.json({ error: 'Select a company.' }, { status: 400 })

  const [{ data: floor }, { data: company }] = await Promise.all([
    service.from('floors').select('id').eq('id', floorId).eq('property_id', propertyId).maybeSingle(),
    service.from('tenant_companies').select('id, is_active').eq('id', body.companyId).eq('property_id', propertyId).maybeSingle(),
  ])
  if (!floor) return NextResponse.json({ error: 'Floor not found.' }, { status: 404 })
  if (!company) return NextResponse.json({ error: 'Company not found.' }, { status: 404 })
  if (!company.is_active) return NextResponse.json({ error: 'This company is deactivated.' }, { status: 409 })

  const { data: occupancy, error } = await service
    .from('floor_occupancies')
    .insert({ property_id: propertyId, floor_id: floorId, company_id: company.id, starts_on: today() })
    .select('*')
    .single()

  if (error) {
    // floor_occupancies_one_current: the floor already has a tenant
    if (error.code === '23505') {
      return NextResponse.json({ error: 'This floor already has a tenant. Remove the current tenant first.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ occupancy }, { status: 201 })
}

/** Removes the current tenant from a floor; the occupancy is kept as history (Administrators only, D4). */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { slug, floorId } = await params
  const session = await requireSession()
  if (!session.ok) return session.response
  const { service } = session

  const access = await authorizeForSlug(session, slug, 'floors.manage')
  if (!access.ok) return access.response

  const { data: ended, error } = await service
    .from('floor_occupancies')
    .update({ ends_on: today() })
    .eq('floor_id', floorId)
    .eq('property_id', access.propertyId)
    .is('ends_on', null)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!ended?.length) return NextResponse.json({ error: 'This floor has no current tenant.' }, { status: 404 })

  return NextResponse.json({ success: true })
}
