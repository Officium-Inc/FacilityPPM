import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { findAuthUserByEmail } from '@/lib/auth-users'
import { hashToken, isPlausibleToken } from '@/lib/token'
import AcceptInviteForm from './AcceptInviteForm'

interface Props {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params
  if (!isPlausibleToken(token)) notFound()
  const service = await createServiceClient()

  const { data: invite } = await service
    .from('invitations')
    .select('email, invited_name, expires_at, used_at, properties(name)')
    .eq('token_hash', hashToken(token))
    .maybeSingle()

  if (!invite) notFound()

  const rawProperty = invite.properties as { name: string } | { name: string }[] | null
  const property = (Array.isArray(rawProperty) ? rawProperty[0] : rawProperty) ?? { name: 'your property' }

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

  if (new Date(invite.expires_at as string) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md px-4">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Invitation expired</h2>
          <p className="text-gray-500 text-sm">This invitation link has expired. Please ask your administrator to send a new one.</p>
        </div>
      </div>
    )
  }

  const inviteEmail = (invite.email as string).toLowerCase()
  const isExistingUser = Boolean(await findAuthUserByEmail(service, inviteEmail))

  return (
    <AcceptInviteForm
      token={token}
      email={inviteEmail}
      propertyName={property.name}
      invitedName={invite.invited_name as string | null}
      isExistingUser={isExistingUser}
    />
  )
}
