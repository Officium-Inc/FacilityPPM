import { NextRequest, NextResponse } from 'next/server'
import { authorizeForSlug, requireSession } from '@/lib/authz/guard'
import { roleNameFromRelation } from '@/lib/roles'

interface Params {
  params: Promise<{ slug: string; companyId: string }>
}

/**
 * Links a tenant member to this company (Administrators and Property Managers, D5/D19).
 * Their earlier requests without a company are attached to it so the company can see them.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { slug, companyId } = await params
  const session = await requireSession()
  if (!session.ok) return session.response
  const { service } = session

  const access = await authorizeForSlug(session, slug, 'companies.manage')
  if (!access.ok) return access.response
  const { propertyId } = access

  const body = await request.json().catch(() => ({})) as { engineerId?: string }
  if (!body.engineerId) return NextResponse.json({ error: 'Select a tenant user.' }, { status: 400 })

  const [{ data: company }, { data: member }] = await Promise.all([
    service.from('tenant_companies').select('id, is_active').eq('id', companyId).eq('property_id', propertyId).maybeSingle(),
    service.from('engineers').select('id, roles(name)').eq('id', body.engineerId).eq('property_id', propertyId).maybeSingle(),
  ])
  if (!company) return NextResponse.json({ error: 'Company not found.' }, { status: 404 })
  if (!company.is_active) return NextResponse.json({ error: 'This company is deactivated.' }, { status: 409 })
  if (!member) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
  if (roleNameFromRelation(member.roles) !== 'tenant') {
    return NextResponse.json({ error: 'Only tenant users can be linked to a company.' }, { status: 400 })
  }

  const { error } = await service
    .from('engineers')
    .update({ company_id: companyId })
    .eq('id', member.id)
    .eq('property_id', propertyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: attached, error: backfillError } = await service
    .from('work_orders')
    .update({ company_id: companyId })
    .eq('property_id', propertyId)
    .eq('requested_by_id', member.id)
    .is('company_id', null)
    .select('id')
  if (backfillError) console.error('[companies/members] failed to attach earlier requests:', backfillError.message)

  return NextResponse.json({ success: true, attachedRequests: attached?.length ?? 0 })
}

/** Unlinks a tenant member from this company (they lose request access until linked again). */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { slug, companyId } = await params
  const session = await requireSession()
  if (!session.ok) return session.response

  const access = await authorizeForSlug(session, slug, 'companies.manage')
  if (!access.ok) return access.response

  const body = await request.json().catch(() => ({})) as { engineerId?: string }
  if (!body.engineerId) return NextResponse.json({ error: 'Select a tenant user.' }, { status: 400 })

  const { data: unlinked, error } = await session.service
    .from('engineers')
    .update({ company_id: null })
    .eq('id', body.engineerId)
    .eq('property_id', access.propertyId)
    .eq('company_id', companyId)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!unlinked?.length) return NextResponse.json({ error: 'Member not found in this company.' }, { status: 404 })
  return NextResponse.json({ success: true })
}
