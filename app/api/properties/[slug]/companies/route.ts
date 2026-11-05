import { NextRequest, NextResponse } from 'next/server'
import { authorizeForSlug, requireSession } from '@/lib/authz/guard'
import { companyFields, type CompanyInput } from '@/lib/companies'

interface Params {
  params: Promise<{ slug: string }>
}

/** Adds a tenant company (Administrators and Property Managers, D5). */
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params
  const session = await requireSession()
  if (!session.ok) return session.response

  const access = await authorizeForSlug(session, slug, 'companies.manage')
  if (!access.ok) return access.response

  const body = await request.json().catch(() => ({})) as CompanyInput
  const parsed = companyFields(body, { requireName: true })
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { data: company, error } = await session.service
    .from('tenant_companies')
    .insert({ ...parsed.fields, property_id: access.propertyId })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'A company with this name already exists.' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ company }, { status: 201 })
}
