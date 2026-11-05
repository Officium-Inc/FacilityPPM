import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { MEMBER_MANAGER_ROLES, canManageMemberRole } from '@/lib/roles'
import { authorizePropertyRole } from '@/lib/work-order-access'

interface Params {
  params: Promise<{ inviteId: string }>
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { inviteId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const propertyId = user.app_metadata?.property_id as string | undefined
  if (!propertyId) return NextResponse.json({ error: 'No active property' }, { status: 400 })

  const service = await createServiceClient()
  const access = await authorizePropertyRole(service, user, propertyId, MEMBER_MANAGER_ROLES)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  // Verify the invitation belongs to this property
  const { data: inv } = await service
    .from('invitations')
    .select('id, property_id, role_name')
    .eq('id', inviteId)
    .eq('property_id', propertyId)
    .maybeSingle()

  if (!inv) return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 })
  if (!canManageMemberRole(access.actor.role, inv.role_name ?? '')) {
    return NextResponse.json({ error: 'You cannot manage invitations for this role.' }, { status: 403 })
  }

  const { error } = await service.from('invitations').delete().eq('id', inviteId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
