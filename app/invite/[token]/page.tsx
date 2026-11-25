import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { findAuthUserByEmail } from '@/lib/auth-users'
import { hashToken, isPlausibleToken } from '@/lib/token'
import AcceptInviteForm from './AcceptInviteForm'

interface Props {
  params: Promise<{ token: string }>
}

interface InviteView {
  email: string
  invited_name: string | null
  expires_at: string
  used_at: string | null
  targetName: string
  scope: 'property' | 'organization'
}

function relationName(value: unknown, fallback: string) {
  const row = (Array.isArray(value) ? value[0] : value) as { name?: string } | null | undefined
  return row?.name ?? fallback
}

/** A property invitation, or an Org Admin invitation (D30); both are looked up by the token's hash. */
async function loadInvite(token: string): Promise<InviteView | null> {
  const service = await createServiceClient()
  const tokenHash = hashToken(token)

  const { data: invite } = await service
    .from('invitations')
    .select('email, invited_name, expires_at, used_at, properties(name)')
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (invite) {
    return {
      email: invite.email as string,
      invited_name: invite.invited_name as string | null,
      expires_at: invite.expires_at as string,
      used_at: invite.used_at as string | null,
      targetName: relationName(invite.properties, 'your property'),
      scope: 'property',
    }
  }

  const { data: orgInvite } = await service
    .from('organization_invitations')
    .select('email, invited_name, expires_at, used_at, organizations(name)')
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (!orgInvite) return null
  return {
    email: orgInvite.email as string,
    invited_name: orgInvite.invited_name as string | null,
    expires_at: orgInvite.expires_at as string,
    used_at: orgInvite.used_at as string | null,
    targetName: relationName(orgInvite.organizations, 'your organization'),
    scope: 'organization',
  }
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params
  if (!isPlausibleToken(token)) notFound()

  const invite = await loadInvite(token)
  if (!invite) notFound()

  if (invite.used_at) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md px-4">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Invitation already used</h2>
          <p className="text-gray-500 text-sm">This invitation link has already been accepted. Please sign in normally.</p>
          <a href="/login" className="mt-6 inline-block text-blue-600 text-sm hover:underline">Go to login →</a>
        </div>
      </div>
    )
  }

  if (new Date(invite.expires_at) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md px-4">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Invitation expired</h2>
          <p className="text-gray-500 text-sm">This invitation link has expired. Please ask your administrator to send a new one.</p>
        </div>
      </div>
    )
  }

  const inviteEmail = invite.email.toLowerCase()
  const service = await createServiceClient()
  const isExistingUser = Boolean(await findAuthUserByEmail(service, inviteEmail))

  return (
    <AcceptInviteForm
      token={token}
      email={inviteEmail}
      propertyName={invite.targetName}
      scope={invite.scope}
      invitedName={invite.invited_name}
      isExistingUser={isExistingUser}
    />
  )
}
