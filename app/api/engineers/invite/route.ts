import { NextRequest, NextResponse } from 'next/server'
import { sendInviteEmail } from '@/lib/email'
import { assignableRoles, toPropertyRole } from '@/lib/authz/permissions'
import { authorize, requireSession } from '@/lib/authz/guard'

export async function POST(request: NextRequest) {
  const session = await requireSession()
  if (!session.ok) return session.response
  const { user, service } = session

  const propertyId = user.app_metadata?.property_id as string | undefined
  if (!propertyId) return NextResponse.json({ error: 'No active property' }, { status: 400 })

  const access = await authorize(session, 'members.manage', { propertyId })
  if (!access.ok) return access.response

  const body = await request.json() as {
    email?: string
    name?: string
    role_name?: string
  }
  const roleName = toPropertyRole(body.role_name)

  if (!body.email?.trim()) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  }
  if (!roleName) {
    return NextResponse.json({ error: 'Select a role for this invitation.' }, { status: 400 })
  }
  if (!assignableRoles(access.actor).includes(roleName)) {
    return NextResponse.json({ error: 'You cannot invite members with this role.' }, { status: 403 })
  }

  const email = body.email.trim().toLowerCase()

  // Get property info for email
  const { data: property } = await service
    .from('properties')
    .select('id, name, slug')
    .eq('id', propertyId)
    .single()

  if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 })

  // Check for existing active engineer in this property
  const { data: existingEng } = await service
    .from('engineers')
    .select('id')
    .eq('property_id', propertyId)
    .eq('email', email)
    .maybeSingle()

  if (existingEng) {
    return NextResponse.json({ error: 'A member with this email already exists in this property.' }, { status: 409 })
  }

  // Block duplicate pending invitations
  const { data: existingInvite } = await service
    .from('invitations')
    .select('id')
    .eq('property_id', propertyId)
    .eq('email', email)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (existingInvite) {
    return NextResponse.json({ error: 'A pending invitation for this email already exists.' }, { status: 409 })
  }

  // Create invitation record
  const { data: invite, error: inviteErr } = await service
    .from('invitations')
    .insert({
      property_id: propertyId,
      email,
      invited_name: body.name?.trim() || null,
      role_name: roleName,
      invited_by: user.email ?? null,
    })
    .select('id, token')
    .single()

  if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 500 })

  // Send invite email
  try {
    await sendInviteEmail({
      toEmail: email,
      toName: body.name?.trim(),
      propertyName: property.name,
      token: invite.token,
      invitedBy: user.email ?? undefined,
    })
  } catch {
    // Roll back invite if email fails
    await service.from('invitations').delete().eq('id', invite.id)
    return NextResponse.json({ error: 'Failed to send invitation email. Check email configuration.' }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 201 })
}
