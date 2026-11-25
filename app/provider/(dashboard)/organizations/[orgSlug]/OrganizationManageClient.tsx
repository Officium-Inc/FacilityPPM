'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Activity, AlertTriangle, BarChart3, Building2, Plus, Trash2, Users } from 'lucide-react'
import LicensePanel from '@/components/provider/LicensePanel'
import AccountPanel from '@/components/provider/AccountPanel'
import OrgMembersPanel from '@/components/org/OrgMembersPanel'
import OrgProfileForm from '@/components/org/OrgProfileForm'
import OrgPropertiesTable from '@/components/org/OrgPropertiesTable'
import { describeAuditEntry } from '@/lib/provider/audit-labels'
import { formatPHT } from '@/lib/utils'
import type { OrgProfileValues } from '@/components/org/OrgProfileForm'
import type { OrgAccountStatus } from '@/lib/org/accounts'
import type { OrgInvitationView, OrgMemberView, OrgPropertyRow } from '@/lib/org/overview'
import type { AuditEntry } from '@/lib/provider/activity'
import type { LicenseStatus } from '@/types'

interface Props {
  organization: OrgProfileValues & {
    slug: string
    license_status: string
    license_expires_at: string | null
  }
  account: OrgAccountStatus
  properties: OrgPropertyRow[]
  members: OrgMemberView[]
  invitations: OrgInvitationView[]
  audit: AuditEntry[]
}

type Tab = 'overview' | 'properties' | 'admins' | 'activity' | 'danger'

export default function OrganizationManageClient({ organization, account, properties, members, invitations, audit }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('overview')
  const [confirmName, setConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const apiBase = `/api/provider/organizations/${encodeURIComponent(organization.slug)}`
  const activeAdmins = members.filter((member) => member.is_active).length

  async function deleteOrganization() {
    setDeleting(true)
    setDeleteError(null)
    const res = await fetch(apiBase, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: confirmName }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setDeleteError(data.error ?? 'Deletion failed.')
      setDeleting(false)
      return
    }
    router.push('/provider/organizations')
    router.refresh()
  }

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'properties', label: `Properties (${properties.length})`, icon: Building2 },
    { id: 'admins', label: `Org Admins (${activeAdmins})`, icon: Users },
    { id: 'activity', label: 'Activity', icon: Activity },
    { id: 'danger', label: 'Danger Zone', icon: AlertTriangle },
  ]

  return (
    <div>
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-gray-200">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === id
                ? id === 'danger' ? 'border-red-500 text-red-600' : 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          {activeAdmins === 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                This organization has no active administrator, so its properties have no Administrator from the organization.
                Invite an Owner from the Org Admins tab.
              </span>
            </div>
          )}
          <LicensePanel
            endpoint={apiBase}
            licenseStatus={organization.license_status as LicenseStatus}
            licenseExpiresAt={organization.license_expires_at}
            terminated={account.terminated}
            audit={audit}
          />
          <OrgProfileForm endpoint={apiBase} organization={organization} slug={organization.slug} canEdit />
        </div>
      )}

      {tab === 'properties' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-500">Every Org Admin is an Administrator in each of these properties.</p>
            {!account.terminated && (
              <Link
                href={`/provider/properties/new?org=${encodeURIComponent(organization.slug)}`}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
              >
                <Plus className="h-4 w-4" />
                Add Property
              </Link>
            )}
          </div>
          <OrgPropertiesTable properties={properties} variant="provider" emptyText="No properties yet. Add the first one." />
        </div>
      )}

      {tab === 'admins' && (
        <OrgMembersPanel
          apiBase={apiBase}
          organizationName={organization.name}
          members={members}
          invitations={invitations}
          actor={{ kind: 'provider' }}
        />
      )}

      {tab === 'activity' && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Organization activity</h3>
          {audit.length === 0 ? (
            <p className="text-sm text-gray-400">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {audit.map((entry) => (
                <li key={entry.id} className="text-sm text-gray-700">
                  <span className="mr-2 text-xs text-gray-400">{formatPHT(entry.created_at, true)}</span>
                  {describeAuditEntry(entry)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'danger' && (
        <div className="space-y-6">
          <AccountPanel
            endpoint={`${apiBase}/account`}
            organizationName={organization.name}
            propertyCount={properties.length}
            terminated={account.terminated}
            terminatedAt={account.terminatedAt}
            reason={account.reason}
          />

          <div className="rounded-xl border-2 border-red-200 bg-white p-6">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <h3 className="font-semibold text-red-700">Delete Organization</h3>
            </div>
            {properties.length > 0 ? (
              <p className="text-sm text-gray-600">
                The organization still has {properties.length} propert{properties.length === 1 ? 'y' : 'ies'}. Delete them first, or
                terminate the organization instead (reversible).
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Permanently deletes <em>{organization.name}</em>, its administrators and invitations. This cannot be undone.
                  Type <strong>{organization.name}</strong> to confirm:
                </p>
                <input
                  type="text"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={organization.name}
                  className="w-full rounded-lg border border-red-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-red-400"
                />
                {deleteError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</div>}
                <button
                  onClick={deleteOrganization}
                  disabled={deleting || confirmName !== organization.name}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-400"
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? 'Deleting…' : 'Permanently Delete Organization'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
