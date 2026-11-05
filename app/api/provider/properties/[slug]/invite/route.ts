import { NextRequest, NextResponse } from 'next/server'
import { requireProvider } from '@/lib/authz/guard'
import { createAdminInvite, logProviderAction, requestIp } from '@/lib/provider/accounts'

interface Params {
  params: Promise<{ slug: string }>
}

/** Invites an Administrator into the property; provider invitations always create Administrators. */
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params
  const provider = await requireProvider()
  if (!provider.ok) return provider.response
  const { service, user } = provider

  const body = await request.json().catch(() => ({})) as { email?: string; name?: string }
  if (!body.email?.trim()) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  }

  const { data: property } = await service
    .from('properties')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle()
  if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 })

  const result = await createAdminInvite(service, property, body.email, body.name)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  await logProviderAction(service, { userId: user.id, ip: requestIp(request) }, {
    propertyId: property.id,
    action: 'member.invited',
    metadata: { email: body.email.trim().toLowerCase(), role: 'admin' },
  })

  return NextResponse.json({ success: true }, { status: 201 })
}