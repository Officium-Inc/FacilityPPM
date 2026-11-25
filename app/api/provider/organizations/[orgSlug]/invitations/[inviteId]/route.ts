import { NextRequest, NextResponse } from 'next/server'
import { requireProvider } from '@/lib/authz/guard'
import { requestIp } from '@/lib/provider/accounts'
import { resendOrgInvite, revokeOrgInvite } from '@/lib/org/members'

interface Params {
  params: Promise<{ orgSlug: string; inviteId: string }>
}

async function context(request: NextRequest, params: Params['params']) {
  const { orgSlug, inviteId } = await params
  const provider = await requireProvider()
  if (!provider.ok) return { error: provider.response } as const
  const { service, user, actor } = provider
  const { data: organization } = await service.from('organizations').select('id, name').eq('slug', orgSlug).maybeSingle()
  if (!organization) return { error: NextResponse.json({ error: 'Organization not found.' }, { status: 404 }) } as const
  return {
    service,
    organization,
    inviteId,
    ctx: { actor, userId: user.id, email: user.email ?? null, ip: requestIp(request) },
  } as const
}

/** Resends an unused Org Admin invitation with a new token and expiry. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const found = await context(request, params)
  if ('error' in found) return found.error
  const result = await resendOrgInvite(found.service, found.organization, found.inviteId, found.ctx)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ success: true, expires_at: result.expires_at })
}

/** Revokes an Org Admin invitation. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const found = await context(request, params)
  if ('error' in found) return found.error
  const result = await revokeOrgInvite(found.service, found.organization, found.inviteId, found.ctx)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ success: true })
}
