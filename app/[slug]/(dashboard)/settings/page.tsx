import { createClient, createServiceClient } from '@/lib/supabase/server'
import EngineersClient from '../engineers/EngineersClient'

interface Props {
  params: Promise<{ slug: string }>
}

const MANAGE_ROLES = ['admin', 'property_manager']

export default async function SettingsPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const propertyId = user?.app_metadata?.property_id as string | undefined

  const service = await createServiceClient()

  // Determine user role for this property
  let userRole = 'viewer'
  if (user?.app_metadata?.role === 'provider') {
    userRole = 'admin'
  } else if (user && propertyId) {
    const { data: eng } = await service
      .from('engineers')
      .select('roles(name)')
      .eq('property_id', propertyId)
      .eq('user_id', user.id)
      .maybeSingle()
    const roleData = (eng?.roles as unknown as { name: string } | null)
    userRole = roleData?.name ?? 'viewer'
  }

  const canManageMembers = MANAGE_ROLES.includes(userRole)

  const [{ data: engineers }, { data: roles }, { data: pendingInvitations }] = await Promise.all([
    service
      .from('engineers')
      .select('*, roles(id, name)')
      .eq('property_id', propertyId ?? '')
      .order('full_name'),
    service.from('roles').select('id, name').order('name'),
    service
      .from('invitations')
      .select('id, email, invited_name, role_name, invited_by, created_at, expires_at')
      .eq('property_id', propertyId ?? '')
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">Manage property members and roles</p>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          <span className="border-b-2 border-green-600 pb-3 text-sm font-medium text-green-700">
            Members
          </span>
        </nav>
      </div>

      <EngineersClient
        slug={slug}
        engineers={engineers ?? []}
        roles={roles ?? []}
        invitations={pendingInvitations ?? []}
        canManageMembers={canManageMembers}
      />
    </div>
  )
}
