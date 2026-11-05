import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requirePage } from '@/lib/authz/guard'
import { can } from '@/lib/authz/permissions'
import EngineersClient from '../engineers/EngineersClient'
import ApiKeysClient from './ApiKeysClient'
import SettingsHubClient from './SettingsHubClient'
import ProfileClient from './ProfileClient'
import CompanyProfileClient from './CompanyProfileClient'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ tab?: string }>
}

const TABS = {
  members: {
    title: 'Members',
    subtitle: 'Invite teammates, assign roles, and manage access',
  },
  'api-keys': {
    title: 'API Keys & Integrations',
    subtitle: 'Connect Monday.com and manage API credentials',
  },
  profile: {
    title: 'Your Profile',
    subtitle: 'Update your personal details and password',
  },
  company: {
    title: 'Company Profile',
    subtitle: 'Manage your company details and contact information',
  },
} as const

type TabKey = keyof typeof TABS

export default async function SettingsPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { tab } = await searchParams
  const activeTab: TabKey | null = tab && tab in TABS ? (tab as TabKey) : null
  const { user, service, property: currentProperty, actor } = await requirePage(slug, 'portal.admin')
  const propertyId = currentProperty.id

  let myEngineer: { full_name: string; email: string; phone: string | null } | null = null
  if (actor.kind === 'member') {
    const { data: eng } = await service
      .from('engineers')
      .select('full_name, email, phone')
      .eq('id', actor.engineerId)
      .maybeSingle()
    myEngineer = eng ?? null
  }

  const canViewMembers = can(actor, 'members.view')
  const canManageMembers = can(actor, 'members.manage')
  const canManageIntegrations = can(actor, 'property.integrations.manage')
  const canEditProfile = can(actor, 'property.profile.edit')
  const navActor = actor.kind === 'provider' ? { kind: 'provider' as const } : { kind: 'member' as const, role: actor.role }

  const [{ data: engineers }, { data: roles }, { data: pendingInvitations }, { data: property }] = await Promise.all([
    canViewMembers
      ? service
        .from('engineers')
        .select('*, roles(id, name)')
        .eq('property_id', propertyId)
        .order('full_name')
      : Promise.resolve({ data: [] }),
    service.from('roles').select('id, name').order('name'),
    canViewMembers
      ? service
        .from('invitations')
        .select('id, email, invited_name, role_name, invited_by, created_at, expires_at')
        .eq('property_id', propertyId)
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    service
      .from('properties')
      // `*` so the page keeps working before migration 018 adds the work order form fields
      .select('*')
      .eq('id', propertyId)
      .maybeSingle(),
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
          canManageSettings={canManageMembers}
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
        <h2 className="mt-2 text-xl font-bold text-gray-900">{TABS[activeTab].title}</h2>
        <p className="text-sm text-gray-500 mt-0.5">{TABS[activeTab].subtitle}</p>
      </div>

      {activeTab === 'api-keys' ? (
        <ApiKeysClient canManageIntegrations={canManageIntegrations} />
      ) : activeTab === 'profile' ? (
        <ProfileClient
          fullName={myEngineer?.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? ''}
          email={myEngineer?.email ?? user.email ?? ''}
          phone={myEngineer?.phone ?? ''}
          roleName={actor.kind === 'provider' ? 'provider' : actor.role}
        />
      ) : activeTab === 'company' ? (
        property ? (
          <CompanyProfileClient property={property} canManage={canEditProfile} />
        ) : (
          <p className="text-sm text-gray-500">No active property found.</p>
        )
      ) : canViewMembers ? (
        <EngineersClient
          slug={slug}
          engineers={engineers ?? []}
          roles={roles ?? []}
          invitations={pendingInvitations ?? []}
          canManageMembers={canManageMembers}
          actor={navActor}
        />
      ) : (
        <p className="text-sm text-gray-500">Your role cannot view the member list.</p>
      )}
    </div>
  )
}
