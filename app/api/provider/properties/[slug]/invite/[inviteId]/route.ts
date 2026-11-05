import { NextRequest, NextResponse } from 'next/server'
import { requireProvider, type Service } from '@/lib/authz/guard'
import { sendInviteEmail } from '@/lib/email'
import { generateLinkToken, hashToken } from '@/lib/token'
import { logProviderAction, requestIp } from '@/lib/provider/accounts'

interface Params {
  params: Promise<{ slug: string; inviteId: string }>
}

/** The unused invitation, only when it belongs to the property in the URL. */
async function loadInvite(service: Service, slug: string, inviteId: string) {
  const { data: property } = await service.from('properties').select('id, name').eq('slug', slug).maybeSingle()
  if (!property) return null
  const { data: invite } = await service
    .from('invitations')
    .select('id, email, invited_name, used_at')
    .eq('id', inviteId)
    .eq('property_id', property.id)
    .maybeSingle()
  return invite ? { property, invite } : null
}

/** Revokes an invitation. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { slug, inviteId } = await params
  const provider = await requireProvider()
  if (!provider.ok) return provider.response
  const { service, user } = provider

  const found = await loadInvite(service, slug, inviteId)
  if (!found) return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 })

  const { error } = await service.from('invitations').delete().eq('id', found.invite.id).eq('property_id', found.property.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logProviderAction(service, { userId: user.id, ip: requestIp(request) }, {
    propertyId: found.property.id,
    action: 'member.invite_revoked',
    entityType: 'invitation',
    entityId: found.invite.id,
    metadata: { email: found.invite.email },
  })

  return NextResponse.json({ success: true })
}

/** Resends an unused invitation with a new token and expiry. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { slug, inviteId } = await params
  const provider = await requireProvider()
  if (!provider.ok) return provider.response
  const { service, user } = provider

  const found = await loadInvite(service, slug, inviteId)
  if (!found) return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 })
  const { property, invite } = found
  if (invite.used_at) return NextResponse.json({ error: 'This invitation was already accepted.' }, { status: 409 })

  const newToken = generateLinkToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { error: updateErr } = await service
    .from('invitations')
    .update({ token_hash: hashToken(newToken), expires_at: expiresAt })
    .eq('id', invite.id)
    .eq('property_id', property.id)
    .is('used_at', null)

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

  await logProviderAction(service, { userId: user.id, ip: requestIp(request) }, {
    propertyId: property.id,
    action: 'member.invite_resent',
    entityType: 'invitation',
    entityId: invite.id,
    metadata: { email: invite.email },
  })

  return NextResponse.json({ success: true, expires_at: expiresAt })
}