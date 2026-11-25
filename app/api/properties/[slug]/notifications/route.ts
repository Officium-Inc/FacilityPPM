import { NextRequest, NextResponse } from 'next/server'
import { requireSession, type Service } from '@/lib/authz/guard'

// audit-allow-file: only reads/updates notifications addressed to the caller's own member row in this property

interface Params {
  params: Promise<{ slug: string }>
}

/** The caller's own member row in the property `slug`, or null. */
async function ownMemberId(service: Service, userId: string, slug: string) {
  const { data: property } = await service.from('properties').select('id').eq('slug', slug).maybeSingle()
  if (!property) return null
  const { data: engineer } = await service
    .from('engineers')
    .select('id')
    .eq('user_id', userId)
    .eq('property_id', property.id)
    .maybeSingle()
  return (engineer?.id as string | undefined) ?? null
}

// GET — the caller's notifications in this property (unread first, then recent read)
export async function GET(_req: NextRequest, { params }: Params) {
  const { slug } = await params
  const session = await requireSession()
  if (!session.ok) return session.response
  const { user, service } = session

  const engineerId = await ownMemberId(service, user.id, slug)
  if (!engineerId) return NextResponse.json([])

  const { data, error } = await service
    .from('notifications')
    .select('id, type, title, message, link, read, created_at')
    .eq('engineer_id', engineerId)
    .order('read', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// PATCH — mark all as read (or specific ids)
export async function PATCH(req: NextRequest, { params }: Params) {
  const { slug } = await params
  const session = await requireSession()
  if (!session.ok) return session.response
  const { user, service } = session

  const engineerId = await ownMemberId(service, user.id, slug)
  if (!engineerId) return NextResponse.json({ ok: true })

  const body = await req.json().catch(() => ({}))
  const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((id): id is string => typeof id === 'string') : []

  let query = service
    .from('notifications')
    .update({ read: true })
    .eq('engineer_id', engineerId)
    .eq('read', false)

  if (ids.length > 0) query = query.in('id', ids)

  await query
  return NextResponse.json({ ok: true })
}
