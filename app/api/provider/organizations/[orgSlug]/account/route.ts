import { NextRequest, NextResponse } from 'next/server'
import { requireProvider } from '@/lib/authz/guard'
import { isLicenseStatus } from '@/lib/provider/license'
import { requestIp } from '@/lib/provider/accounts'
import { reactivateOrganization, terminateOrganization } from '@/lib/org/accounts'

interface Params {
  params: Promise<{ orgSlug: string }>
}

/** Terminates or reactivates an organization and all its property accounts (D23, D29). */
export async function POST(request: NextRequest, { params }: Params) {
  const { orgSlug } = await params
  const provider = await requireProvider()
  if (!provider.ok) return provider.response
  const { service, user } = provider

  const body = await request.json().catch(() => ({})) as { action?: string; reason?: string; license_status?: string }

  const { data: organization } = await service
    .from('organizations')
    .select('id, slug, name, license_status, license_expires_at')
    .eq('slug', orgSlug)
    .maybeSingle()
  if (!organization) return NextResponse.json({ error: 'Organization not found.' }, { status: 404 })

  const ctx = { userId: user.id, ip: requestIp(request) }

  if (body.action === 'terminate') {
    const reason = body.reason?.trim().slice(0, 1000) || null
    const result = await terminateOrganization(service, organization, ctx, reason)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ success: true, properties: result.properties, deactivated: result.deactivated, banned: result.banned })
  }

  if (body.action === 'reactivate') {
    if (body.license_status !== undefined && (!isLicenseStatus(body.license_status) || body.license_status === 'suspended')) {
      return NextResponse.json({ error: 'Choose an active or trial license.' }, { status: 400 })
    }
    const result = await reactivateOrganization(service, organization, ctx, body.license_status)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({
      success: true,
      properties: result.properties,
      reactivated: result.reactivated,
      license_status: result.license_status,
    })
  }

  return NextResponse.json({ error: 'Invalid action.' }, { status: 400 })
}
