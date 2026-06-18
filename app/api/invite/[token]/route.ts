import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveCanonicalRoleId } from '@/lib/roles'

interface Params {
  params: Promise<{ token: string }>
}

export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params
  const body = await request.json()
  const { password, full_name } = body as { password?: string; full_name?: string }

  const service = await createServiceClient()

  // Look up the invitation
  const { data: invite } = await service
    .from('invitations')
    .select('*, properties(id, name, slug)')
    .eq('token', token)
    .single()

  if (!invite) return NextResponse.json({ error: 'Invalid invitation link.' }, { status: 404 })
  if (invite.used_at) return NextResponse.json({ error: 'This invitation has already been used.' }, { status: 410 })
  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invitation link has expired.' }, { status: 410 })
  }

  const property = invite.properties as { id: string; name: string; slug: string }
  const email = invite.email as string
  const inviteRoleName = (invite.role_name as string | null) ?? null
  const roleId = await resolveCanonicalRoleId(service, inviteRoleName ?? 'admin')

  // Check if user already exists
  const { data: existingList } = await service.auth.admin.listUsers()
  const existingUser = existingList?.users?.find((u) => u.email === email)

  if (existingUser) {
    // User already has an account — just add this property to their metadata
    const meta = existingUser.app_metadata ?? {}
    const currentIds: string[] = (meta.property_ids as string[] | undefined) ?? []
    const currentSlugs: string[] = (meta.property_slugs as string[] | undefined) ?? []

    if (!currentIds.includes(property.id)) {
      await service.auth.admin.updateUserById(existingUser.id, {
        app_metadata: {
          ...meta,
          property_ids: [...currentIds, property.id],
          property_slugs: [...currentSlugs, property.slug],
        },
      })
      // Ensure engineer record exists
      const { data: existingEng } = await service
        .from('engineers')
        .select('id')
        .eq('user_id', existingUser.id)
        .eq('property_id', property.id)
        .single()

      if (!existingEng) {
        await service.from('engineers').insert({
          property_id: property.id,
          user_id: existingUser.id,
          role_id: roleId,
          full_name: (full_name?.trim()) || (existingUser.user_metadata?.full_name as string) || email,
          email: email.toLowerCase(),
          is_active: true,
        })
      }
    }
  } else {
    // New user — password is required
    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    }

    const displayName = full_name?.trim() || invite.invited_name || email

    const { data: authData, error: authErr } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: {
        role: 'superadmin',
        property_id: property.id,
        property_slug: property.slug,
        property_ids: [property.id],
        property_slugs: [property.slug],
      },
      user_metadata: { full_name: displayName },
    })

    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })

    const { error: engErr } = await service.from('engineers').insert({
      property_id: property.id,
      user_id: authData.user.id,
      role_id: roleId,
      full_name: displayName,
      email: email.toLowerCase(),
      is_active: true,
    })

    if (engErr) {
      await service.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: engErr.message }, { status: 500 })
    }
  }

  // Mark invitation as used
  await service.from('invitations').update({ used_at: new Date().toISOString() }).eq('token', token)

  return NextResponse.json({ success: true, property_slug: property.slug }, { status: 200 })
}
