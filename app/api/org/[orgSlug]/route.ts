import { NextRequest, NextResponse } from 'next/server'
import { authorizeOrg, requireSession } from '@/lib/authz/guard'
import { requestIp } from '@/lib/provider/accounts'
import { parseOrgProfile } from '@/lib/org/profile'
import { logOrgAction } from '@/lib/org/members'

interface Params {
  params: Promise<{ orgSlug: string }>
}

/** Org Admins edit the organization profile (name and contact details). The license is Platform Admin's. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { orgSlug } = await params
  const session = await requireSession()
  if (!session.ok) return session.response
  const { service, user } = session

  const access = await authorizeOrg(session, orgSlug, 'org.profile.edit')
  if (!access.ok) return access.response
  const { organization, actor } = access

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  if (body.license_status !== undefined || body.license_expires_at !== undefined) {
    return NextResponse.json({ error: 'The license is managed by Platform Admin.' }, { status: 403 })
  }
  const profile = parseOrgProfile(body)
  if ('error' in profile) return NextResponse.json({ error: profile.error }, { status: 400 })
  if (Object.keys(profile).length === 0) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })

  const { error } = await service
    .from('organizations')
    .update({ ...profile, updated_at: new Date().toISOString() })
    .eq('id', organization.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const renamed = Boolean(profile.name && profile.name !== organization.name)
  await logOrgAction(service, { actor, userId: user.id, ip: requestIp(request) }, {
    organizationId: organization.id,
    action: renamed ? 'organization.renamed' : 'organization.updated',
    metadata: renamed ? { from: organization.name, to: profile.name } : { fields: Object.keys(profile) },
  })

  return NextResponse.json({ success: true })
}
