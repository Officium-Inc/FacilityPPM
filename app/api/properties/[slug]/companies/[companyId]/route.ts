import { NextRequest, NextResponse } from 'next/server'
import { authorizeForSlug, requireSession } from '@/lib/authz/guard'
import { companyFields, type CompanyInput } from '@/lib/companies'

interface Params {
  params: Promise<{ slug: string; companyId: string }>
}

/**
 * Edits a tenant company or (de)activates it (Administrators and Property Managers, D5).
 * Deactivating a company also vacates its floors; its tenant members lose request access until relinked.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { slug, companyId } = await params
  const session = await requireSession()
  if (!session.ok) return session.response
  const { service } = session

  const access = await authorizeForSlug(session, slug, 'companies.manage')
  if (!access.ok) return access.response
  const { propertyId } = access

  const body = await request.json().catch(() => ({})) as CompanyInput & { isActive?: boolean }
  const parsed = companyFields(body, { requireName: false })
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const updates: Record<string, unknown> = { ...parsed.fields }
  if (body.isActive !== undefined) updates.is_active = Boolean(body.isActive)
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })

  const { data: company, error } = await service
    .from('tenant_companies')
    .update(updates)
    .eq('id', companyId)
    .eq('property_id', propertyId)
    .select('*')
    .maybeSingle()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'A company with this name already exists.' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!company) return NextResponse.json({ error: 'Company not found.' }, { status: 404 })

  if (body.isActive === false) {
    await service
      .from('floor_occupancies')
      .update({ ends_on: new Date().toISOString().slice(0, 10) })
      .eq('company_id', companyId)
      .eq('property_id', propertyId)
      .is('ends_on', null)
  }

  return NextResponse.json({ company })
}
