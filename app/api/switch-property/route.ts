import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/authz/guard'
import { resolveMembership } from '@/lib/authz/actor'

/**
 * Sets the user's active property (app_metadata.property_id/slug), used for the starting page. The user must
 * be an active member of the target property, directly or as an Org Admin of its organization.
 */
export async function POST(request: NextRequest) {
  // audit-allow: the target property is checked with resolveMembership (active member row + access lists)
  const session = await requireSession()
  if (!session.ok) return session.response
  const { user, service } = session

  const { slug } = (await request.json().catch(() => ({}))) as { slug?: string }
  if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 })

  const { data: property } = await service.from('properties').select('id, slug').eq('slug', slug).maybeSingle()
  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  const membership = await resolveMembership(service, user, property.id as string)
  if (membership.status !== 'ok' || membership.actor.kind !== 'member') {
    return NextResponse.json({ error: 'Access denied to this property' }, { status: 403 })
  }

  const { error: updateErr } = await service.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...user.app_metadata,
      property_id: property.id,
      property_slug: property.slug,
    },
  })
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ success: true, slug: property.slug })
}
