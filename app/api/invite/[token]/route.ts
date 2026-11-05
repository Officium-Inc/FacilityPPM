import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveCanonicalRoleId } from '@/lib/roles'
import { toPropertyRole } from '@/lib/authz/permissions'
import { findAuthUserByEmail, grantPropertyAccess } from '@/lib/auth-users'

interface Params {
  params: Promise<{ token: string }>
}

type InviteProperty = { id: string; name: string; slug: string }

export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params
  const body = await request.json().catch(() => ({}))
  const { password, full_name } = body as { password?: string; full_name?: string }

  const service = await createServiceClient()

  const { data: invite } = await service
    .from('invitations')
    .select('id, email, invited_name, role_name, expires_at, used_at, properties(id, name, slug)')
    .eq('token', token)
    .maybeSingle()

  if (!invite) return NextResponse.json({ error: 'Invalid invitation link.' }, { status: 404 })
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
    const { error } = await grantPropertyAccess(service, existingUser, property)
    if (error) {
      await release()
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else {
    const { data: authData, error: authErr } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: {
        property_id: property.id,
        property_slug: property.slug,
        property_ids: [property.id],
        property_slugs: [property.slug],
      },
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
    email,
    fullName: existingUser
      ? full_name?.trim() || (existingUser.user_metadata?.full_name as string | undefined) || displayName
      : displayName,
  })

  if (memberError) {
    if (createdUser) await service.auth.admin.deleteUser(userId)
    await release()
    return NextResponse.json({ error: memberError }, { status: 500 })
  }

  return NextResponse.json({ success: true, property_slug: property.slug }, { status: 200 })
}

/** Creates the member row, or reactivates/links an existing one with the invited role. */
async function ensureMember(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  input: { propertyId: string; userId: string; roleId: string; email: string; fullName: string }
): Promise<string | null> {
  const { data: byUser } = await service
    .from('engineers')
    .select('id')
    .eq('property_id', input.propertyId)
    .eq('user_id', input.userId)
    .maybeSingle()

  if (byUser) {
    const { error } = await service
      .from('engineers')
      .update({ role_id: input.roleId, is_active: true })
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
      .update({ user_id: input.userId, role_id: input.roleId, is_active: true })
      .eq('id', byEmail.id)
    return error?.message ?? null
  }

  const { error } = await service.from('engineers').insert({
    property_id: input.propertyId,
    user_id: input.userId,
    role_id: input.roleId,
    full_name: input.fullName,
    email: input.email,
    is_active: true,
  })
  return error?.message ?? null
}
