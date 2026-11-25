import { NextRequest, NextResponse } from 'next/server'
import { requireProvider } from '@/lib/authz/guard'
import { parseLicenseUpdate } from '@/lib/provider/license'
import { logProviderAction, requestIp } from '@/lib/provider/accounts'
import { updateOrganizationLicense } from '@/lib/org/accounts'
import { parseOrgProfile } from '@/lib/org/profile'
import { deprovisionOrgMember } from '@/lib/org/provisioning'
import { syncUserAccess } from '@/lib/auth-users'

interface Params {
  params: Promise<{ orgSlug: string }>
}

/** Renames the organization, edits its profile, or changes its license (mirrored to its properties, D29). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { orgSlug } = await params
  const provider = await requireProvider()
  if (!provider.ok) return provider.response
  const { service, user } = provider

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const license = parseLicenseUpdate(body)
  if ('error' in license) return NextResponse.json({ error: license.error }, { status: 400 })
  const profile = parseOrgProfile(body)
  if ('error' in profile) return NextResponse.json({ error: profile.error }, { status: 400 })
  if (Object.keys(license).length === 0 && Object.keys(profile).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { data: organization } = await service
    .from('organizations')
    .select('id, slug, name, license_status, license_expires_at')
    .eq('slug', orgSlug)
    .maybeSingle()
  if (!organization) return NextResponse.json({ error: 'Organization not found.' }, { status: 404 })

  const ctx = { userId: user.id, ip: requestIp(request) }

  if (Object.keys(profile).length > 0) {
    const { error } = await service
      .from('organizations')
      .update({ ...profile, updated_at: new Date().toISOString() })
      .eq('id', organization.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logProviderAction(service, ctx, {
      propertyId: null,
      organizationId: organization.id as string,
      action: profile.name && profile.name !== organization.name ? 'organization.renamed' : 'organization.updated',
      entityType: 'organization',
      entityId: organization.id as string,
      metadata: profile.name && profile.name !== organization.name
        ? { from: organization.name, to: profile.name }
        : { fields: Object.keys(profile) },
    })
  }

  if (Object.keys(license).length > 0) {
    const result = await updateOrganizationLicense(service, organization, license, ctx)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ success: true })
}

/**
 * Deletes an organization that has no properties left (delete or move them first). The caller repeats the
 * organization name in `confirm`. Org Admin memberships are removed and their access lists rebuilt.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { orgSlug } = await params
  const provider = await requireProvider()
  if (!provider.ok) return provider.response
  const { service, user } = provider

  const body = await request.json().catch(() => ({})) as { confirm?: string }

  const { data: organization } = await service
    .from('organizations')
    .select('id, slug, name')
    .eq('slug', orgSlug)
    .maybeSingle()
  if (!organization) return NextResponse.json({ error: 'Organization not found.' }, { status: 404 })
  if (body.confirm?.trim() !== organization.name) {
    return NextResponse.json({ error: 'Type the organization name to confirm deletion.' }, { status: 400 })
  }

  const { count } = await service
    .from('properties')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organization.id)
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: 'Delete the organization’s properties first.' }, { status: 409 })
  }

  const { data: members } = await service
    .from('organization_members')
    .select('id, user_id')
    .eq('organization_id', organization.id)
  for (const member of members ?? []) await deprovisionOrgMember(service, member.id as string)

  // Cascades to members, invitations and the organization's audit entries
  const { error } = await service.from('organizations').delete().eq('id', organization.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  for (const member of members ?? []) await syncUserAccess(service, member.user_id as string)

  await logProviderAction(service, { userId: user.id, ip: requestIp(request) }, {
    propertyId: null,
    action: 'organization.deleted',
    entityType: 'organization',
    entityId: organization.id as string,
    metadata: { name: organization.name, slug: organization.slug, members_removed: members?.length ?? 0 },
  })

  return NextResponse.json({ success: true })
}
