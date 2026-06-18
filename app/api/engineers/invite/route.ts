import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendInviteEmail } from '@/lib/email'
import { normalizeRoleName } from '@/lib/roles'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const propertyId = user.app_metadata?.property_id as string | undefined
  if (!propertyId) return NextResponse.json({ error: 'No active property' }, { status: 400 })

  const body = await request.json() as {
    email?: string
    name?: string
    role_name?: string
  }
  const roleName = normalizeRoleName(body.role_name)

  if (!body.email?.trim()) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  }

  const email = body.email.trim().toLowerCase()
  const service = await createServiceClient()

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
      role_name: roleName || null,
      invited_by: user.email ?? null,
    })
    .select('token')
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
    await service.from('invitations').delete().eq('token', invite.token)
    return NextResponse.json({ error: 'Failed to send invitation email. Check email configuration.' }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 201 })
}
