import { createClient, createServiceClient } from '@/lib/supabase/server'
import { normalizeRoleName } from '@/lib/roles'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import EngineersClient from '../engineers/EngineersClient'
import ApiKeysClient from './ApiKeysClient'
import SettingsHubClient from './SettingsHubClient'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ tab?: string }>
}

const MANAGE_ROLES = ['admin', 'property_manager']

export default async function SettingsPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { tab } = await searchParams
  const activeTab = tab === 'api-keys' ? 'api-keys' : tab === 'members' ? 'members' : null
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
    userRole = normalizeRoleName(roleData?.name) || 'viewer'
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

  if (!activeTab) {
    return (
      <div className="space-y-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-xl font-bold text-gray-900">Settings</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage property members and integrations</p>
        </div>
        <SettingsHubClient
          slug={slug}
          memberCount={engineers?.length ?? 0}
          pendingInviteCount={pendingInvitations?.length ?? 0}
          canManageSettings={canManageSettings}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/${slug}/settings`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-green-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Settings
        </Link>
        <h2 className="mt-2 text-xl font-bold text-gray-900">
          {activeTab === 'api-keys' ? 'API Keys & Integrations' : 'Members'}
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {activeTab === 'api-keys'
            ? 'Connect Monday.com and manage API credentials'
            : 'Invite teammates, assign roles, and manage access'}
        </p>
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
