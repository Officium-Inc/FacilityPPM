import { NextRequest, NextResponse } from 'next/server'
import { requireProvider } from '@/lib/authz/guard'
import { isLicenseStatus } from '@/lib/provider/license'
import { reactivatePropertyAccount, requestIp, terminatePropertyAccount } from '@/lib/provider/accounts'

interface Params {
  params: Promise<{ slug: string }>
}

/** Terminates or reactivates a property account (D18). Termination is reversible; deletion is separate. */
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params
  const provider = await requireProvider()
  if (!provider.ok) return provider.response
  const { service, user } = provider

  const body = await request.json().catch(() => ({})) as { action?: string; reason?: string; license_status?: string }

  const { data: property } = await service
    .from('properties')
    .select('id, slug, license_status')
    .eq('slug', slug)
    .maybeSingle()
  if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 })

  const ctx = { userId: user.id, ip: requestIp(request) }

  if (body.action === 'terminate') {
    const reason = body.reason?.trim().slice(0, 1000) || null
    const result = await terminatePropertyAccount(service, property, ctx, reason)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ success: true, deactivated: result.deactivated, banned: result.banned })
  }

  if (body.action === 'reactivate') {
    if (body.license_status !== undefined && (!isLicenseStatus(body.license_status) || body.license_status === 'suspended')) {
      return NextResponse.json({ error: 'Choose an active or trial license.' }, { status: 400 })
    }
    const result = await reactivatePropertyAccount(service, property, ctx, body.license_status)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ success: true, reactivated: result.reactivated, license_status: result.license_status })
  }

  return NextResponse.json({ error: 'Invalid action.' }, { status: 400 })
}