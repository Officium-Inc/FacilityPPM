import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import AcceptInviteForm from './AcceptInviteForm'

interface Props {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params
  const service = await createServiceClient()

  const { data: invite } = await service
    .from('invitations')
    .select('*, properties(name)')
    .eq('token', token)
    .single()

  if (!invite) notFound()

  const property = invite.properties as { name: string }

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

  // Check if email already has an account
  const { data: existingList } = await service.auth.admin.listUsers()
  const isExistingUser = existingList?.users?.some((u) => u.email === invite.email) ?? false

  return (
    <AcceptInviteForm
      token={token}
      email={invite.email as string}
      propertyName={property.name}
      invitedName={invite.invited_name as string | null}
      isExistingUser={isExistingUser}
    />
  )
}
