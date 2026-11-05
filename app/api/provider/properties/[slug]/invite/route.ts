import { NextRequest, NextResponse } from 'next/server'
import { requireProvider } from '@/lib/authz/guard'
import { sendInviteEmail } from '@/lib/email'

interface Params {
  params: Promise<{ slug: string }>
}

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params

  const provider = await requireProvider()

  if (!provider.ok) return provider.response

  const body = await request.json()
  const { email, name } = body as { email?: string; name?: string }

  if (!email?.trim()) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  }

  const service = provider.service

  const { data: property } = await service
    .from('properties')
    .select('id, name, slug')
    .eq('slug', slug)
    .single()

  if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 })

  // Block duplicate pending invitations for the same email
  const { data: existing } = await service
    .from('invitations')
    .select('id')
    .eq('property_id', property.id)
    .eq('email', email.trim().toLowerCase())
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'A pending invitation for this email already exists.' },
      { status: 409 },
    )
  }

  // Provider invitations create the property's Administrators
  const { data: invite, error: inviteErr } = await service
    .from('invitations')
    .insert({
      property_id: property.id,
      email: email.trim().toLowerCase(),
      invited_name: name?.trim() || null,
      role_name: 'admin',
    })
    .select('id, token')
    .single()

  if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 500 })

  // Send invite email
  try {
    await sendInviteEmail({
      toEmail: email.trim().toLowerCase(),
      toName: name?.trim(),
      propertyName: property.name,
      token: invite.token,
    })
  } catch {
    // Roll back invite if email fails
    await service.from('invitations').delete().eq('id', invite.id)
    return NextResponse.json({ error: 'Failed to send invitation email.' }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 201 })
}
