import { NextRequest, NextResponse } from 'next/server'
import { authorizeOrg, requireSession } from '@/lib/authz/guard'
import { inviteOrgMember } from '@/lib/org/members'
import { orgOpsContext } from '@/lib/org/route-context'

interface Params {
  params: Promise<{ orgSlug: string }>
}

/** Org Admins invite another Org Admin; only owners may invite owners. */
export async function POST(request: NextRequest, { params }: Params) {
  const { orgSlug } = await params
  const session = await requireSession()
  if (!session.ok) return session.response

  const access = await authorizeOrg(session, orgSlug, 'org.members.manage')
  if (!access.ok) return access.response

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const result = await inviteOrgMember(session.service, access.organization, body, orgOpsContext(request, session.user, access.actor))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ success: true, id: result.inviteId }, { status: 201 })
}
