import { createClient, createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import EngineersClient from '../engineers/EngineersClient'
import ApiKeysClient from './ApiKeysClient'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ tab?: string }>
}

const MANAGE_ROLES = ['admin', 'property_manager']

export default async function SettingsPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { tab = 'members' } = await searchParams
  const activeTab = tab === 'api-keys' ? 'api-keys' : 'members'
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

  const canManageSettings = MANAGE_ROLES.includes(userRole)

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
        <p className="text-sm text-gray-500 mt-0.5">Manage property members and integrations</p>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          <Link
            href={`/${slug}/settings`}
            className={`pb-3 text-sm font-medium ${
              activeTab === 'members'
                ? 'border-b-2 border-green-600 text-green-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Members
          </Link>
          <Link
            href={`/${slug}/settings?tab=api-keys`}
            className={`pb-3 text-sm font-medium ${
              activeTab === 'api-keys'
                ? 'border-b-2 border-green-600 text-green-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            API Keys
          </Link>
        </nav>
      </div>

      {activeTab === 'api-keys' ? (
        <ApiKeysClient canManageIntegrations={canManageSettings} />
      ) : (
        <EngineersClient
          slug={slug}
          engineers={engineers ?? []}
          roles={roles ?? []}
          invitations={pendingInvitations ?? []}
          canManageMembers={canManageSettings}
        />
      )}
    </div>
  )
}
