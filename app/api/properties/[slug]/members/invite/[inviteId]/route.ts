import { NextRequest, NextResponse } from 'next/server'
import { canManageMember } from '@/lib/authz/permissions'
import { authorizeForSlug, requireSession } from '@/lib/authz/guard'

interface Params {
  params: Promise<{ slug: string; inviteId: string }>
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { slug, inviteId } = await params

  const session = await requireSession()
  if (!session.ok) return session.response
  const { service } = session

  const access = await authorizeForSlug(session, slug, 'members.manage')
  if (!access.ok) return access.response
  const { propertyId } = access

  // Verify the invitation belongs to this property
  const { data: inv } = await service
    .from('invitations')
    .select('id, property_id, role_name')
    .eq('id', inviteId)
    .eq('property_id', propertyId)
    .maybeSingle()

  if (!inv) return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 })
  if (!canManageMember(access.actor, inv.role_name)) {
    return NextResponse.json({ error: 'You cannot manage invitations for this role.' }, { status: 403 })
  }

  const { error } = await service.from('invitations').delete().eq('id', inviteId).eq('property_id', propertyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
