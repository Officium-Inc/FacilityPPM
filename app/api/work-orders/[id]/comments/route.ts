import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = await createServiceClient()
  const { data, error } = await service
    .from('work_order_comments')
    .select('id, author_name, author_role, message, created_at')
    .eq('work_order_id', id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const propertyId = user.app_metadata?.property_id as string | undefined
  if (!propertyId) return NextResponse.json({ error: 'No active property' }, { status: 400 })

  const body = await req.json()
  const message = (body?.message ?? '') as string
  if (!message.trim()) return NextResponse.json({ error: 'Message is required' }, { status: 400 })

  const service = await createServiceClient()

  // Resolve author name + role from engineer record
  const { data: engineer } = await service
    .from('engineers')
    .select('full_name, roles(name)')
    .eq('user_id', user.id)
    .eq('property_id', propertyId)
    .maybeSingle()

  const authorName = engineer?.full_name ?? (user.email ?? 'Unknown')
  const rawRole = engineer?.roles
  const roleName = Array.isArray(rawRole)
    ? (rawRole[0] as { name: string } | undefined)?.name ?? 'admin'
    : (rawRole as unknown as { name: string } | null)?.name ?? 'admin'

  const { error } = await service.from('work_order_comments').insert({
    work_order_id: id,
    property_id: propertyId,
    author_name: authorName,
    author_role: roleName.toLowerCase(),
    message: message.trim(),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
