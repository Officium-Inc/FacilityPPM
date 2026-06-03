import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendInviteEmail } from '@/lib/email'

interface Params {
  params: Promise<{ slug: string }>
}

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== 'provider') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { email, name } = body as { email?: string; name?: string }

  if (!email?.trim()) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  }

  const service = await createServiceClient()

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

  // Create invitation record
  const { data: invite, error: inviteErr } = await service
    .from('invitations')
    .insert({
      property_id: property.id,
      email: email.trim().toLowerCase(),
      invited_name: name?.trim() || null,
    })
    .select('token')
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
    await service.from('invitations').delete().eq('token', invite.token)
    return NextResponse.json({ error: 'Failed to send invitation email.' }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 201 })
}
