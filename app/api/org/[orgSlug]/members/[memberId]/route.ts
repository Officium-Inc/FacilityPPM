import { NextRequest, NextResponse } from 'next/server'
import { authorizeOrg, requireSession } from '@/lib/authz/guard'
import { removeOrgMember, updateOrgMember } from '@/lib/org/members'
import { orgOpsContext } from '@/lib/org/route-context'

interface Params {
  params: Promise<{ orgSlug: string; memberId: string }>
}

/** Changes another Org Admin's role or status (the organization keeps at least one active owner). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { orgSlug, memberId } = await params
  const session = await requireSession()
  if (!session.ok) return session.response

  const access = await authorizeOrg(session, orgSlug, 'org.members.manage')
  if (!access.ok) return access.response

  const body = await request.json().catch(() => ({})) as { org_role?: unknown; is_active?: unknown }
  const result = await updateOrgMember(session.service, access.organization, memberId, body, orgOpsContext(request, session.user, access.actor))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ success: true })
}

/** Removes another Org Admin and the Administrator rows the membership created. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { orgSlug, memberId } = await params
  const session = await requireSession()
  if (!session.ok) return session.response

  const access = await authorizeOrg(session, orgSlug, 'org.members.manage')
  if (!access.ok) return access.response

  const result = await removeOrgMember(session.service, access.organization, memberId, orgOpsContext(request, session.user, access.actor))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ success: true })
}
