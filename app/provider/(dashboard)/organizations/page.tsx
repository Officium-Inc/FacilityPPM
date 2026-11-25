import Link from 'next/link'
import { AlertTriangle, Plus } from 'lucide-react'
import LicenseBadge from '@/components/provider/LicenseBadge'
import { requireProviderPage } from '@/lib/authz/guard'
import { getTerminatedOrganizationIds } from '@/lib/org/accounts'
import { licenseDateInput, licenseState } from '@/lib/provider/license'
import { formatPHT } from '@/lib/utils'

interface OrganizationListRow {
  id: string
  slug: string
  name: string
  license_status: string
  license_expires_at: string | null
  created_at: string
}

export default async function OrganizationsPage() {
  const { service } = await requireProviderPage()

  const [{ data: organizations }, { data: properties }, { data: members }, terminated] = await Promise.all([
    service.from('organizations').select('id, slug, name, license_status, license_expires_at, created_at').order('name'),
    service.from('properties').select('organization_id'),
    service.from('organization_members').select('organization_id, is_active'),
    getTerminatedOrganizationIds(service),
  ])

  const propertyCounts = new Map<string, number>()
  for (const row of (properties ?? []) as Array<{ organization_id: string | null }>) {
    if (row.organization_id) propertyCounts.set(row.organization_id, (propertyCounts.get(row.organization_id) ?? 0) + 1)
  }
  const adminCounts = new Map<string, number>()
  for (const row of (members ?? []) as Array<{ organization_id: string; is_active: boolean }>) {
    if (row.is_active) adminCounts.set(row.organization_id, (adminCounts.get(row.organization_id) ?? 0) + 1)
  }
  const rows = (organizations ?? []) as OrganizationListRow[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Organizations</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {rows.length} organization{rows.length === 1 ? '' : 's'}. The license lives on the organization and covers all its properties.
          </p>
        </div>
        <Link
          href="/provider/organizations/new"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800"
        >
          <Plus className="h-4 w-4" />
          Create Organization
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Organization', 'License', 'Properties', 'Org Admins', 'Created', ''].map((heading) => (
                  <th key={heading} className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-gray-400">No organizations yet. Create the first one.</td>
                </tr>
              ) : (
                rows.map((org) => {
                  const isTerminated = terminated.has(org.id)
                  const expiresOn = licenseDateInput(org.license_expires_at)
                  const admins = adminCounts.get(org.id) ?? 0
                  return (
                    <tr key={org.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <div className="font-medium text-gray-900">{org.name}</div>
                        <code className="text-xs text-gray-400">{org.slug}</code>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-col gap-0.5">
                          <LicenseBadge status={isTerminated ? 'terminated' : licenseState(org)} />
                          {expiresOn && !isTerminated && <span className="text-[11px] text-gray-400">until {expiresOn}</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-600">{propertyCounts.get(org.id) ?? 0}</td>
                      <td className="px-5 py-3 text-gray-600">
                        {admins > 0 ? admins : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                            <AlertTriangle className="h-3 w-3" />
                            None
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-500">{formatPHT(org.created_at)}</td>
                      <td className="px-5 py-3 text-right">
                        <Link href={`/provider/organizations/${org.slug}`} className="text-sm font-medium text-blue-600 hover:underline">
                          Manage
                        </Link>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
