import Link from 'next/link'
import LicenseBadge from '@/components/provider/LicenseBadge'
import { requireProviderPage } from '@/lib/authz/guard'
import { loadProviderOverview } from '@/lib/provider/activity'
import { getTerminatedPropertyIds } from '@/lib/provider/account-status'
import { licenseDateInput, licenseState } from '@/lib/provider/license'
import { formatPHT } from '@/lib/utils'
import { Plus, Eye } from 'lucide-react'

export default async function PropertiesPage() {
  const { service } = await requireProviderPage()

  const [{ properties: rows }, terminated] = await Promise.all([
    loadProviderOverview(service, { events: false }),
    getTerminatedPropertyIds(service),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Control Panel</h2>
          <p className="text-sm text-gray-500 mt-0.5">{rows.length} property account{rows.length === 1 ? '' : 's'}</p>
        </div>
        <Link
          href="/provider/properties/new"
          className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Account
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Property', 'Slug / URL', 'License', 'Members', 'Open WOs', 'Last Activity', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-gray-400">
                    No properties yet. Create your first account.
                  </td>
                </tr>
              ) : (
                rows.map((prop) => {
                  const isTerminated = terminated.has(prop.id)
                  const expiresOn = licenseDateInput(prop.license_expires_at)
                  return (
                    <tr key={prop.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-900">{prop.name}</td>
                      <td className="px-5 py-3 text-gray-600">
                        <div className="flex items-center gap-2">
                          <code className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-xs">/{prop.slug}</code>
                          <a
                            href={`/${prop.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:text-blue-700"
                            title="Open support view (read-only)"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-col gap-0.5">
                          <LicenseBadge status={isTerminated ? 'terminated' : licenseState(prop)} />
                          {expiresOn && !isTerminated && <span className="text-[11px] text-gray-400">until {expiresOn}</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-600">{prop.activeMembers}</td>
                      <td className="px-5 py-3 text-gray-600">{prop.summary.open}</td>
                      <td className="px-5 py-3 text-gray-500">
                        {prop.summary.lastActivityAt ? formatPHT(prop.summary.lastActivityAt) : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          href={`/provider/properties/${prop.slug}`}
                          className="text-blue-600 hover:underline text-sm font-medium"
                        >
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