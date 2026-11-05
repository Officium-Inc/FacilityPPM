import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { requireProvider } from '@/lib/authz/guard'
import { sendInviteEmail } from '@/lib/email'

interface Params {
  params: Promise<{ slug: string; inviteId: string }>
}


export async function DELETE(_req: NextRequest, { params }: Params) {
  const { inviteId } = await params

  const provider = await requireProvider()

  if (!provider.ok) return provider.response

  const service = provider.service
  const { error } = await service.from('invitations').delete().eq('id', inviteId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

// PATCH = resend: regenerates token + resets expiry + re-sends email
export async function PATCH(_req: NextRequest, { params }: Params) {
  const { slug, inviteId } = await params

  const provider = await requireProvider()

  if (!provider.ok) return provider.response

  const service = provider.service

  const { data: invite, error: fetchErr } = await service
    .from('invitations')
    .select('email, invited_name')
    .eq('id', inviteId)
    .single()

  if (fetchErr || !invite) {
    return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 })
  }

  const { data: property } = await service
    .from('properties')
    .select('name')
    .eq('slug', slug)
    .single()

  if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 })

  const newToken = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { error: updateErr } = await service
    .from('invitations')
    .update({ token: newToken, expires_at: expiresAt })
    .eq('id', inviteId)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  try {
    await sendInviteEmail({
      toEmail: invite.email,
      toName: invite.invited_name ?? undefined,
      propertyName: property.name,
      token: newToken,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to send invitation email.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, expires_at: expiresAt })
}
