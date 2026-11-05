import { NextRequest, NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendMentionEmail } from '@/lib/email'
import { canViewWorkOrder, isProviderUser } from '@/lib/work-order-access'
import { resolveWorkOrderActor } from '@/lib/work-order-events'

interface Params {
  params: Promise<{ id: string }>
}

const MAX_COMMENT_LENGTH = 4000

type Service = Awaited<ReturnType<typeof createServiceClient>>

/** Loads the work order and checks the caller may see it; comments follow the work order's visibility. */
async function authorizeComments(service: Service, user: User, id: string) {
  const { data: wo } = await service
    .from('work_orders')
    .select('id, wo_number, property_id, requested_by_id, tenant_email, engineer_id, properties(slug, name)')
    .eq('id', id)
    .maybeSingle()

  if (!wo || !(await canViewWorkOrder(service, user, wo))) return null
  return wo
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = await createServiceClient()
  const wo = await authorizeComments(service, user, id)
  if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })

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

  const body = await req.json().catch(() => ({}))
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  if (message.length > MAX_COMMENT_LENGTH) {
    return NextResponse.json({ error: `Comments are limited to ${MAX_COMMENT_LENGTH} characters.` }, { status: 400 })
  }

  const service = await createServiceClient()
  const wo = await authorizeComments(service, user, id)
  if (!wo?.property_id) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })
  const propertyId = wo.property_id as string

  const actor = isProviderUser(user)
    ? { id: null, name: user.email ?? 'Provider', role: 'provider' }
    : await resolveWorkOrderActor(service, user, propertyId)
  const authorEngineer = actor.id ? { id: actor.id } : null
  const authorName = actor.name

  const { error } = await service.from('work_order_comments').insert({
    work_order_id: id,
    property_id: propertyId,
    author_name: authorName,
    author_role: actor.role,
    message,
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
      .neq('id', authorEngineer?.id ?? '00000000-0000-0000-0000-000000000000')

    if (allEngineers && allEngineers.length > 0) {
      const property = wo.properties as { slug?: string; name?: string } | { slug?: string; name?: string }[] | null
      const propertyInfo = Array.isArray(property) ? property[0] : property
      const slug = propertyInfo?.slug
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
      const woLink = slug ? `${appUrl}/${slug}/work-orders/${id}` : appUrl
      const woNumber = (wo.wo_number as string | null) ?? id

      const mentionedEngineers = allEngineers.filter((e) =>
        mentionedNames.some((mn) => e.full_name.toLowerCase().includes(mn))
      )

      const propertyName = propertyInfo?.name ?? 'Property'

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

