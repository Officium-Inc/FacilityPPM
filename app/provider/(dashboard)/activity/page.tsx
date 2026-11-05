import Link from 'next/link'
import { Activity } from 'lucide-react'
import LicenseBadge from '@/components/provider/LicenseBadge'
import { requireProviderPage } from '@/lib/authz/guard'
import { loadProviderOverview } from '@/lib/provider/activity'
import { getTerminatedPropertyIds } from '@/lib/provider/account-status'
import { licenseState } from '@/lib/provider/license'
import { formatPHT } from '@/lib/utils'

/** Cross-property activity: work order volume per property and the latest workflow events everywhere. */
export default async function ProviderActivityPage() {
  const { service } = await requireProviderPage()
  const [{ properties, events }, terminated] = await Promise.all([
    loadProviderOverview(service),
    getTerminatedPropertyIds(service),
  ])

  const totals = properties.reduce(
    (sum, row) => ({
      total: sum.total + row.summary.total,
      open: sum.open + row.summary.open,
      awaitingTenant: sum.awaitingTenant + row.summary.awaitingTenant,
      completed: sum.completed + row.summary.completedLast30Days,
    }),
    { total: 0, open: 0, awaitingTenant: 0, completed: 0 }
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Activity</h2>
        <p className="text-sm text-gray-500 mt-0.5">Work across every property account.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: 'Work orders', value: totals.total },
          { label: 'Open', value: totals.open },
          { label: 'Waiting on tenants', value: totals.awaitingTenant },
          { label: 'Completed (30 days)', value: totals.completed },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{kpi.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Property', 'License', 'Members', 'Open', 'Waiting on tenant', 'Completed (30d)', 'Cancelled', 'Last activity'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {properties.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-gray-400">No properties yet.</td></tr>
              ) : properties.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <Link href={`/provider/properties/${row.slug}`} className="font-medium text-blue-700 hover:underline">{row.name}</Link>
                  </td>
                  <td className="px-5 py-3"><LicenseBadge status={terminated.has(row.id) ? 'terminated' : licenseState(row)} /></td>
                  <td className="px-5 py-3 text-gray-600">{row.activeMembers}</td>
                  <td className="px-5 py-3 text-gray-600">{row.summary.open}</td>
                  <td className="px-5 py-3 text-gray-600">{row.summary.awaitingTenant}</td>
                  <td className="px-5 py-3 text-gray-600">{row.summary.completedLast30Days}</td>
                  <td className="px-5 py-3 text-gray-600">{row.summary.cancelled}</td>
                  <td className="px-5 py-3 text-gray-500">{row.summary.lastActivityAt ? formatPHT(row.summary.lastActivityAt, true) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <section className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <Activity className="w-4 h-4 text-gray-400" />
          <h3 className="font-semibold text-gray-900 text-sm">Latest workflow events</h3>
        </div>
        {events.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-400">No events yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {events.map((event) => (
              <li key={event.id} className="px-5 py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {event.property && (
                    <Link href={`/provider/properties/${event.property.slug}`} className="font-medium text-gray-900 hover:underline">
                      {event.property.name}
                    </Link>
                  )}
                  {event.wo_number && <span className="text-gray-500">{event.wo_number}</span>}
                  <span className="text-gray-800">{event.step}</span>
                  {event.decision && <span className="text-gray-500">· {event.decision}</span>}
                </div>
                <p className="text-xs text-gray-400">
                  {formatPHT(event.created_at, true)}
                  {event.actor_name ? ` · ${event.actor_name}` : ''}
                  {event.actor_role ? ` (${event.actor_role})` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}