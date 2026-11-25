import { NextRequest, NextResponse } from 'next/server'
import { requireProvider } from '@/lib/authz/guard'
import { requestIp } from '@/lib/provider/accounts'
import { removeOrgMember, updateOrgMember } from '@/lib/org/members'

interface Params {
  params: Promise<{ orgSlug: string; memberId: string }>
}

/** Changes an Org Admin's role or status. Platform Admin may change the last owner too (it restores access). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { orgSlug, memberId } = await params
  const provider = await requireProvider()
  if (!provider.ok) return provider.response
  const { service, user, actor } = provider

  const { data: organization } = await service.from('organizations').select('id, name').eq('slug', orgSlug).maybeSingle()
  if (!organization) return NextResponse.json({ error: 'Organization not found.' }, { status: 404 })

  const body = await request.json().catch(() => ({})) as { org_role?: unknown; is_active?: unknown }
  const result = await updateOrgMember(service, organization, memberId, body, {
    actor,
    userId: user.id,
    email: user.email ?? null,
    ip: requestIp(request),
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ success: true })
}

/** Removes an Org Admin and the Administrator rows the membership created. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { orgSlug, memberId } = await params
  const provider = await requireProvider()
  if (!provider.ok) return provider.response
  const { service, user, actor } = provider

  const { data: organization } = await service.from('organizations').select('id, name').eq('slug', orgSlug).maybeSingle()
  if (!organization) return NextResponse.json({ error: 'Organization not found.' }, { status: 404 })

  const result = await removeOrgMember(service, organization, memberId, {
    actor,
    userId: user.id,
    email: user.email ?? null,
    ip: requestIp(request),
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ success: true })
}
