import { NextRequest, NextResponse } from 'next/server'
import { canManageMember } from '@/lib/authz/permissions'
import { authorize, requireSession } from '@/lib/authz/guard'

interface Params {
  params: Promise<{ inviteId: string }>
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { inviteId } = await params

  const session = await requireSession()
  if (!session.ok) return session.response
  const { user, service } = session

  const propertyId = user.app_metadata?.property_id as string | undefined
  if (!propertyId) return NextResponse.json({ error: 'No active property' }, { status: 400 })

  const access = await authorize(session, 'members.manage', { propertyId })
  if (!access.ok) return access.response

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

  const { error } = await service.from('invitations').delete().eq('id', inviteId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
