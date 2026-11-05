import { NextRequest, NextResponse } from 'next/server'
import { requireProvider } from '@/lib/authz/guard'
import { parseLicenseUpdate } from '@/lib/provider/license'
import { createAdminInvite, logProviderAction, requestIp } from '@/lib/provider/accounts'

const RESERVED_SLUGS = new Set([
  'provider', 'sign-off', 'costing-approval', 'invite', 'api', '_next', 'admin', 'static', 'login',
  'reset-password', 'favicon', 'robots', 'sitemap', 'suspended',
])

/**
 * Creates a property account (D18): the property with its license and, optionally, the invitation for its
 * first Administrator. A failed invitation does not undo the property; it is reported so it can be resent.
 */
export async function POST(request: NextRequest) {
  const provider = await requireProvider()
  if (!provider.ok) return provider.response
  const { service, user } = provider

  const body = await request.json().catch(() => ({})) as {
    name?: string
    slug?: string
    license_status?: string
    license_expires_at?: string | null
    admin_email?: string
    admin_name?: string
  }

  const name = body.name?.trim() ?? ''
  const cleanSlug = body.slug?.trim().toLowerCase() ?? ''
  if (!name || !cleanSlug) {
    return NextResponse.json({ error: 'Name and slug are required.' }, { status: 400 })
  }
  if (name.length > 120) return NextResponse.json({ error: 'Name is too long.' }, { status: 400 })
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(cleanSlug)) {
    return NextResponse.json(
      { error: 'Slug may only contain lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen.' },
      { status: 400 }
    )
  }
  if (RESERVED_SLUGS.has(cleanSlug)) {
    return NextResponse.json({ error: `"${cleanSlug}" is a reserved slug.` }, { status: 400 })
  }

  const license = parseLicenseUpdate({
    license_status: body.license_status || 'trial',
    ...(body.license_expires_at ? { license_expires_at: body.license_expires_at } : {}),
  })
  if ('error' in license) return NextResponse.json({ error: license.error }, { status: 400 })

  const adminEmail = body.admin_email?.trim() ?? ''

  const { data: property, error } = await service
    .from('properties')
    .insert({
      name,
      slug: cleanSlug,
      license_status: license.license_status,
      license_expires_at: license.license_expires_at ?? null,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A property with this slug already exists.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const ctx = { userId: user.id, ip: requestIp(request) }
  await logProviderAction(service, ctx, {
    propertyId: property.id,
    action: 'property.created',
    metadata: {
      name,
      slug: cleanSlug,
      license_status: license.license_status,
      license_expires_at: license.license_expires_at ?? null,
      first_admin_email: adminEmail || null,
    },
  })

  let invite: { sent: boolean; error?: string } | null = null
  if (adminEmail) {
    const result = await createAdminInvite(service, property, adminEmail, body.admin_name)
    invite = result.ok ? { sent: true } : { sent: false, error: result.error }
    if (result.ok) {
      await logProviderAction(service, ctx, {
        propertyId: property.id,
        action: 'member.invited',
        metadata: { email: adminEmail.toLowerCase(), role: 'admin' },
      })
    }
  }

  return NextResponse.json({ property, invite }, { status: 201 })
}