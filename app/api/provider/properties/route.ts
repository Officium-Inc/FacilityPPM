import { NextRequest, NextResponse } from 'next/server'
import { requireProvider } from '@/lib/authz/guard'
import { requestIp } from '@/lib/provider/accounts'
import { createProperty } from '@/lib/properties/create'

/**
 * Creates a property inside an organization (only Platform Admin creates properties). The property takes the
 * organization's license, and every active Org Admin becomes its Administrator (D29, D30).
 */
export async function POST(request: NextRequest) {
  const provider = await requireProvider()
  if (!provider.ok) return provider.response
  const { service, user } = provider

  const body = await request.json().catch(() => ({})) as {
    organization_id?: unknown
    name?: unknown
    slug?: unknown
    property_type?: unknown
  }

  const result = await createProperty(
    service,
    { organizationId: body.organization_id, name: body.name, slug: body.slug, propertyType: body.property_type },
    { userId: user.id, ip: requestIp(request) }
  )
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({ property: result.property, administrators: result.administrators }, { status: 201 })
}
