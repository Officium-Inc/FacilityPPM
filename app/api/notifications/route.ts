import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// GET /api/notifications — fetch unread (and recent read) notifications for the current user
export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const propertyId = user.app_metadata?.property_id as string | undefined
  if (!propertyId) return NextResponse.json([])

  const service = await createServiceClient()

  // Resolve engineer id
  const { data: engineer } = await service
    .from('engineers')
    .select('id')
    .eq('user_id', user.id)
    .eq('property_id', propertyId)
    .maybeSingle()

  if (!engineer) return NextResponse.json([])

  // Last 50 notifications (unread first, then recent read)
  const { data, error } = await service
    .from('notifications')
    .select('id, type, title, message, link, read, created_at')
    .eq('engineer_id', engineer.id)
    .order('read', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// PATCH /api/notifications — mark all as read (or specific ids)
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const propertyId = user.app_metadata?.property_id as string | undefined
  if (!propertyId) return NextResponse.json({ ok: true })

  const service = await createServiceClient()

  const { data: engineer } = await service
    .from('engineers')
    .select('id')
    .eq('user_id', user.id)
    .eq('property_id', propertyId)
    .maybeSingle()

  if (!engineer) return NextResponse.json({ ok: true })

  const body = await req.json().catch(() => ({}))
  const ids = body?.ids as string[] | undefined

  let query = service
    .from('notifications')
    .update({ read: true })
    .eq('engineer_id', engineer.id)
    .eq('read', false)

  if (ids && ids.length > 0) {
    query = query.in('id', ids)
  }

  await query
  return NextResponse.json({ ok: true })
}
