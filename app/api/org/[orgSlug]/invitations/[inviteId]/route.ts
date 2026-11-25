import { NextRequest, NextResponse } from 'next/server'
import { authorizeOrg, requireSession } from '@/lib/authz/guard'
import { resendOrgInvite, revokeOrgInvite } from '@/lib/org/members'
import { orgOpsContext } from '@/lib/org/route-context'

interface Params {
  params: Promise<{ orgSlug: string; inviteId: string }>
}

/** Resends an unused Org Admin invitation with a new token and expiry. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { orgSlug, inviteId } = await params
  const session = await requireSession()
  if (!session.ok) return session.response

  const access = await authorizeOrg(session, orgSlug, 'org.members.manage')
  if (!access.ok) return access.response

  const result = await resendOrgInvite(session.service, access.organization, inviteId, orgOpsContext(request, session.user, access.actor))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ success: true, expires_at: result.expires_at })
}

/** Revokes an Org Admin invitation. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { orgSlug, inviteId } = await params
  const session = await requireSession()
  if (!session.ok) return session.response

  const access = await authorizeOrg(session, orgSlug, 'org.members.manage')
  if (!access.ok) return access.response

  const result = await revokeOrgInvite(session.service, access.organization, inviteId, orgOpsContext(request, session.user, access.actor))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ success: true })
}
