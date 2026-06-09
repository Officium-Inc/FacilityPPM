import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

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

  // Verify the invitation belongs to this property
  const { data: inv } = await service
    .from('invitations')
    .select('id, property_id')
    .eq('id', inviteId)
    .single()

  if (!inv) return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 })
  if (inv.property_id !== propertyId) return NextResponse.json({ error: 'Access denied.' }, { status: 403 })

  const { error } = await service.from('invitations').delete().eq('id', inviteId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
