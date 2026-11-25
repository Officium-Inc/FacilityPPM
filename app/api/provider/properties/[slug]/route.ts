import { NextRequest, NextResponse } from 'next/server'
import { requireProvider } from '@/lib/authz/guard'
import { isPropertyType } from '@/lib/property-types'
import { logProviderAction, removePropertyFromUser, requestIp } from '@/lib/provider/accounts'

interface Params {
  params: Promise<{ slug: string }>
}

/**
 * Renames a property or changes its type. The license is the organization's (D29): it is changed on the
 * organization and mirrored onto its properties, never per property.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { slug } = await params
  const provider = await requireProvider()
  if (!provider.ok) return provider.response
  const { service, user } = provider

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  if (body.license_status !== undefined || body.license_expires_at !== undefined) {
    return NextResponse.json({ error: 'The license belongs to the organization. Change it on the organization.' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 120) return NextResponse.json({ error: 'Name is required (up to 120 characters).' }, { status: 400 })
    updates.name = name
  }
  if (body.property_type !== undefined) {
    if (!isPropertyType(body.property_type)) return NextResponse.json({ error: 'Invalid property type.' }, { status: 400 })
    updates.property_type = body.property_type
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { data: before } = await service
    .from('properties')
    .select('id, name, property_type, organization_id')
    .eq('slug', slug)
    .maybeSingle()
  if (!before) return NextResponse.json({ error: 'Property not found.' }, { status: 404 })

  const { error } = await service.from('properties').update(updates).eq('id', before.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ctx = { userId: user.id, ip: requestIp(request) }
  if (updates.name && updates.name !== before.name) {
    await logProviderAction(service, ctx, {
      propertyId: before.id,
      organizationId: before.organization_id ?? null,
      action: 'property.renamed',
      metadata: { from: before.name, to: updates.name },
    })
  }
  if (updates.property_type && updates.property_type !== before.property_type) {
    await logProviderAction(service, ctx, {
      propertyId: before.id,
      organizationId: before.organization_id ?? null,
      action: 'property.type_changed',
      metadata: { from: before.property_type, to: updates.property_type },
    })
  }

  return NextResponse.json({ success: true })
}

/**
 * Permanently deletes a property and everything in it. The caller must repeat the property name in
 * `confirm`; prefer terminating the account, which can be reversed.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { slug } = await params
  const provider = await requireProvider()
  if (!provider.ok) return provider.response
  const { service, user } = provider

  const body = await request.json().catch(() => ({})) as { confirm?: string }

  const { data: property } = await service
    .from('properties')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle()
  if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 })

  if (body.confirm?.trim() !== property.name) {
    return NextResponse.json({ error: 'Type the property name to confirm deletion.' }, { status: 400 })
  }

  const { data: members } = await service
    .from('engineers')
    .select('user_id')
    .eq('property_id', property.id)
    .not('user_id', 'is', null)

  const userIds = [...new Set((members ?? []).map((member) => member.user_id as string))]
  await Promise.all(userIds.map((userId) => removePropertyFromUser(service, userId, property)))

  // Cascades to every child record via foreign keys
  const { error } = await service.from('properties').delete().eq('id', property.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Logged without property_id: the property's own audit rows were deleted with it
  await logProviderAction(service, { userId: user.id, ip: requestIp(request) }, {
    propertyId: null,
    action: 'property.deleted',
    entityId: property.id,
    metadata: { name: property.name, slug: property.slug, members_removed: userIds.length },
  })

  return NextResponse.json({ success: true })
}