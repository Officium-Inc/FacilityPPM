import { NextRequest, NextResponse } from 'next/server'
import { requireProvider } from '@/lib/authz/guard'
import { requestIp } from '@/lib/provider/accounts'
import { inviteOrgMember } from '@/lib/org/members'

interface Params {
  params: Promise<{ orgSlug: string }>
}

/** Invites an Org Admin (owner or admin) into the organization. */
export async function POST(request: NextRequest, { params }: Params) {
  const { orgSlug } = await params
  const provider = await requireProvider()
  if (!provider.ok) return provider.response
  const { service, user, actor } = provider

  const { data: organization } = await service.from('organizations').select('id, name').eq('slug', orgSlug).maybeSingle()
  if (!organization) return NextResponse.json({ error: 'Organization not found.' }, { status: 404 })

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const result = await inviteOrgMember(service, organization, body, {
    actor,
    userId: user.id,
    email: user.email ?? null,
    ip: requestIp(request),
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ success: true, id: result.inviteId }, { status: 201 })
}
