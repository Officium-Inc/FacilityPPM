import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendMentionEmail } from '@/lib/email'

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
  const { data: authorEngineer } = await service
    .from('engineers')
    .select('id, full_name, roles(name)')
    .eq('user_id', user.id)
    .eq('property_id', propertyId)
    .maybeSingle()

  const authorName = authorEngineer?.full_name ?? (user.email ?? 'Unknown')
  const rawRole = authorEngineer?.roles
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

  // ── Parse @mentions and fire notifications + emails ────────────────────────
  // Extract @Name mentions (matches @FirstName or @First Last up to 40 chars)
  const mentionPattern = /@([A-Za-z][A-Za-z0-9 ]{0,38}?)(?=[^A-Za-z0-9]|$)/g
  const mentionedNames = [...new Set(
    [...message.trim().matchAll(mentionPattern)].map((m) => m[1].trim().toLowerCase())
  )]

  if (mentionedNames.length > 0) {
    // Fetch all active engineers in this property (excluding the author)
    const { data: allEngineers } = await service
      .from('engineers')
      .select('id, full_name, email')
      .eq('property_id', propertyId)
      .eq('is_active', true)
      .neq('id', authorEngineer?.id ?? '')

    if (allEngineers && allEngineers.length > 0) {
      // Fetch the WO to build a link
      const { data: wo } = await service
        .from('work_orders')
        .select('wo_number, properties(slug)')
        .eq('id', id)
        .single()

      const propertySlug = (wo?.properties as { slug: string } | { slug: string }[] | null)
      const slug = Array.isArray(propertySlug) ? propertySlug[0]?.slug : propertySlug?.slug
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
      const woLink = slug ? `${appUrl}/${slug}/work-orders/${id}` : appUrl
      const woNumber = wo?.wo_number ?? id

      const mentionedEngineers = allEngineers.filter((e) =>
        mentionedNames.some((mn) => e.full_name.toLowerCase().includes(mn))
      )

      // Fetch property name for email subject
      const { data: prop } = await service
        .from('properties')
        .select('name')
        .eq('id', propertyId)
        .single()
      const propertyName = prop?.name ?? 'Property'

      // Create in-app notifications + send emails
      const allTasks = mentionedEngineers.map(async (e) => {
        await service.from('notifications').insert({
          property_id: propertyId,
          engineer_id: e.id,
          type: 'mention',
          title: `${authorName} mentioned you`,
          message: `In ${woNumber}: ${message.trim().slice(0, 120)}${message.trim().length > 120 ? '…' : ''}`,
          link: woLink,
        })

        if (e.email) {
          await sendMentionEmail({
            toEmail: e.email,
            toName: e.full_name,
            fromName: authorName,
            woNumber,
            propertyName,
            message: message.trim(),
            woLink,
          }).catch(() => { /* non-fatal */ })
        }
      })

      void Promise.allSettled(allTasks)
    }
  }

  return NextResponse.json({ ok: true })
}

