import { NextRequest, NextResponse } from 'next/server'
import { requireProvider } from '@/lib/authz/guard'
import { parseLicenseUpdate } from '@/lib/provider/license'
import { logProviderAction, removePropertyFromUser, requestIp } from '@/lib/provider/accounts'

interface Params {
  params: Promise<{ slug: string }>
}

/** Renames a property or changes its license (status and expiry); license changes are audit-logged (D17). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { slug } = await params
  const provider = await requireProvider()
  if (!provider.ok) return provider.response
  const { service, user } = provider

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const license = parseLicenseUpdate(body)
  if ('error' in license) return NextResponse.json({ error: license.error }, { status: 400 })

  const updates: Record<string, unknown> = { ...license }
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 120) return NextResponse.json({ error: 'Name is required (up to 120 characters).' }, { status: 400 })
    updates.name = name
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { data: before } = await service
    .from('properties')
    .select('id, name, license_status, license_expires_at')
    .eq('slug', slug)
    .maybeSingle()
  if (!before) return NextResponse.json({ error: 'Property not found.' }, { status: 404 })

  const { error } = await service.from('properties').update(updates).eq('id', before.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ctx = { userId: user.id, ip: requestIp(request) }
  const licenseChanged =
    (license.license_status !== undefined && license.license_status !== before.license_status) ||
    (license.license_expires_at !== undefined && license.license_expires_at !== before.license_expires_at)
  if (licenseChanged) {
    await logProviderAction(service, ctx, {
      propertyId: before.id,
      action: 'license.updated',
      metadata: {
        from: { status: before.license_status, expires_at: before.license_expires_at ?? null },
        to: {
          status: license.license_status ?? before.license_status,
          expires_at: license.license_expires_at !== undefined ? license.license_expires_at : before.license_expires_at ?? null,
        },
      },
    })
  }
  if (updates.name && updates.name !== before.name) {
    await logProviderAction(service, ctx, {
      propertyId: before.id,
      action: 'property.renamed',
      metadata: { from: before.name, to: updates.name },
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