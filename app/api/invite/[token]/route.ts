import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveCanonicalRoleId } from '@/lib/roles'
import { toPropertyRole } from '@/lib/authz/permissions'
import { findAuthUserByEmail, syncUserAccess } from '@/lib/auth-users'
import { joinOrganization } from '@/lib/org/members'
import { hashToken, isPlausibleToken } from '@/lib/token'

interface Params {
  params: Promise<{ token: string }>
}

type InviteProperty = { id: string; name: string; slug: string }
type Service = Awaited<ReturnType<typeof createServiceClient>>

/** Accepts a property invitation, or (when the token belongs to one) an Org Admin invitation. */
export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params
  if (!isPlausibleToken(token)) return NextResponse.json({ error: 'Invalid invitation link.' }, { status: 404 })
  const body = await request.json().catch(() => ({}))
  const { password, full_name } = body as { password?: string; full_name?: string }

  const service = await createServiceClient()
  const tokenHash = hashToken(token)

  const { data: invite } = await service
    .from('invitations')
    .select('id, email, invited_name, role_name, company_id, expires_at, used_at, properties(id, name, slug)')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (!invite) return acceptOrganizationInvite(service, tokenHash, { password, full_name })
  if (invite.used_at) return NextResponse.json({ error: 'This invitation has already been used.' }, { status: 410 })
  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invitation link has expired.' }, { status: 410 })
  }

  const roleName = toPropertyRole(invite.role_name as string | null)
  if (!roleName) {
    return NextResponse.json(
      { error: 'This invitation has no valid role. Ask your administrator to send a new invitation.' },
      { status: 400 }
    )
  }

  const rawProperty = invite.properties as InviteProperty | InviteProperty[] | null
  const property = Array.isArray(rawProperty) ? rawProperty[0] : rawProperty
  if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 })

  const roleId = await resolveCanonicalRoleId(service, roleName)
  if (!roleId) return NextResponse.json({ error: 'Could not resolve the invited role.' }, { status: 500 })

  const email = (invite.email as string).trim().toLowerCase()
  const existingUser = await findAuthUserByEmail(service, email)

  if (!existingUser && (!password || password.length < 8)) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  // Claim the invitation atomically so a link cannot be used twice in parallel
  const now = new Date().toISOString()
  const { data: claimed } = await service
    .from('invitations')
    .update({ used_at: now })
    .eq('id', invite.id)
    .is('used_at', null)
    .gt('expires_at', now)
    .select('id')
    .maybeSingle()

  if (!claimed) return NextResponse.json({ error: 'This invitation has already been used.' }, { status: 410 })

  const release = () => service.from('invitations').update({ used_at: null }).eq('id', invite.id)
  const displayName = full_name?.trim() || (invite.invited_name as string | null) || email

  let userId: string
  let createdUser = false

  if (existingUser) {
    userId = existingUser.id
  } else {
    const { data: authData, error: authErr } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      // The access lists are rebuilt from the member row below (syncUserAccess)
      app_metadata: {},
      user_metadata: { full_name: displayName },
    })

    if (authErr || !authData.user) {
      await release()
      return NextResponse.json({ error: authErr?.message ?? 'Could not create the account.' }, { status: 500 })
    }
    userId = authData.user.id
    createdUser = true
  }

  const memberError = await ensureMember(service, {
    propertyId: property.id,
    userId,
    roleId,
    // Tenant invitations name the company the new member belongs to
    companyId: roleName === 'tenant' ? ((invite.company_id as string | null) ?? null) : null,
    email,
    fullName: existingUser
      ? full_name?.trim() || (existingUser.user_metadata?.full_name as string | undefined) || displayName
      : displayName,
  })

  if (memberError) {
    if (createdUser) await service.auth.admin.deleteUser(userId)
    await release()
    return NextResponse.json({ error: memberError }, { status: memberError === ORG_MANAGED_CONFLICT ? 409 : 500 })
  }

  const sync = await syncUserAccess(service, userId)
  if (sync.error) return NextResponse.json({ error: sync.error }, { status: 500 })

  return NextResponse.json({ success: true, property_slug: property.slug }, { status: 200 })
}

const ORG_MANAGED_CONFLICT = 'You already administer this property through your organization.'

/**
 * Org Admin invitation (D30): claims it atomically, creates the account when needed, then joins the
 * organization (membership, Administrator rows in every property, access lists).
 */
async function acceptOrganizationInvite(
  service: Service,
  tokenHash: string,
  input: { password?: string; full_name?: string }
) {
  const { data: invite } = await service
    .from('organization_invitations')
    .select('id, organization_id, email, invited_name, org_role, expires_at, used_at, organizations(id, name, slug)')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (!invite) return NextResponse.json({ error: 'Invalid invitation link.' }, { status: 404 })
  if (invite.used_at) return NextResponse.json({ error: 'This invitation has already been used.' }, { status: 410 })
  if (new Date(invite.expires_at as string) < new Date()) {
    return NextResponse.json({ error: 'This invitation link has expired.' }, { status: 410 })
  }

  const rawOrganization = invite.organizations as InviteProperty | InviteProperty[] | null
  const organization = Array.isArray(rawOrganization) ? rawOrganization[0] : rawOrganization
  if (!organization) return NextResponse.json({ error: 'Organization not found.' }, { status: 404 })

  const email = (invite.email as string).trim().toLowerCase()
  const existingUser = await findAuthUserByEmail(service, email)
  if (existingUser?.app_metadata?.role === 'provider') {
    return NextResponse.json({ error: 'Platform Admin accounts cannot join an organization.' }, { status: 409 })
  }
  if (!existingUser && (!input.password || input.password.length < 8)) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  // Claim the invitation atomically so a link cannot be used twice in parallel
  const now = new Date().toISOString()
  const { data: claimed } = await service
    .from('organization_invitations')
    .update({ used_at: now })
    .eq('id', invite.id)
    .is('used_at', null)
    .gt('expires_at', now)
    .select('id')
    .maybeSingle()
  if (!claimed) return NextResponse.json({ error: 'This invitation has already been used.' }, { status: 410 })

  const release = () => service.from('organization_invitations').update({ used_at: null }).eq('id', invite.id)
  const displayName = input.full_name?.trim()
    || (existingUser?.user_metadata?.full_name as string | undefined)
    || (invite.invited_name as string | null)
    || email

  let user = existingUser
  let createdUser = false
  if (!user) {
    const { data: authData, error: authErr } = await service.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      app_metadata: {},
      user_metadata: { full_name: displayName },
    })
    if (authErr || !authData.user) {
      await release()
      return NextResponse.json({ error: authErr?.message ?? 'Could not create the account.' }, { status: 500 })
    }
    user = authData.user
    createdUser = true
  }

  const joinError = await joinOrganization(
    service,
    { id: invite.id as string, organization_id: invite.organization_id as string, email, org_role: invite.org_role as string },
    user,
    displayName
  )
  if (joinError) {
    if (createdUser) await service.auth.admin.deleteUser(user.id)
    await release()
    return NextResponse.json({ error: joinError }, { status: 500 })
  }

  return NextResponse.json({ success: true, org_slug: organization.slug }, { status: 200 })
}

/** Creates the member row, or reactivates/links an existing one with the invited role. */
async function ensureMember(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  input: { propertyId: string; userId: string; roleId: string; companyId: string | null; email: string; fullName: string }
): Promise<string | null> {
  const membership = { role_id: input.roleId, company_id: input.companyId, is_active: true }

  const { data: byUser } = await service
    .from('engineers')
    .select('id, org_member_id')
    .eq('property_id', input.propertyId)
    .eq('user_id', input.userId)
    .maybeSingle()

  if (byUser) {
    // An org-managed Administrator row follows the org membership (D30); a property invitation cannot change it
    if (byUser.org_member_id) return ORG_MANAGED_CONFLICT
    const { error } = await service
      .from('engineers')
      .update(membership)
      .eq('id', byUser.id)
    return error?.message ?? null
  }

  // A member may have been added by email before they had an account
  const { data: byEmail } = await service
    .from('engineers')
    .select('id')
    .eq('property_id', input.propertyId)
    .eq('email', input.email)
    .is('user_id', null)
    .maybeSingle()

  if (byEmail) {
    const { error } = await service
      .from('engineers')
      .update({ ...membership, user_id: input.userId })
      .eq('id', byEmail.id)
    return error?.message ?? null
  }

  const { error } = await service.from('engineers').insert({
    ...membership,
    property_id: input.propertyId,
    user_id: input.userId,
    full_name: input.fullName,
    email: input.email,
  })
  return error?.message ?? null
}
