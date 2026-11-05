import Link from 'next/link'
import { Activity, ClipboardList, ScrollText } from 'lucide-react'
import StatusBadge from '@/components/work-orders/StatusBadge'
import { describeAuditEntry } from '@/lib/provider/audit-labels'
import type { ActivityEvent, AuditEntry, PropertySummary } from '@/lib/provider/activity'
import type { WorkOrderStatus } from '@/types'
import { formatPHT } from '@/lib/utils'

interface Props {
  slug: string
  summary: PropertySummary
  statusCounts: Record<string, number>
  activeMembers: number
  events: ActivityEvent[]
  audit: AuditEntry[]
}

/** Read-only activity of one property for the provider: work order volume, workflow events and audit log. */
export default function PropertyActivityPanel({ slug, summary, statusCounts, activeMembers, events, audit }: Props) {
  const kpis = [
    { label: 'Work orders', value: summary.total },
    { label: 'Open', value: summary.open },
    { label: 'Waiting on tenant', value: summary.awaitingTenant },
    { label: 'Completed (30 days)', value: summary.completedLast30Days },
    { label: 'Active members', value: activeMembers },
  ]
  const statuses = Object.entries(statusCounts).sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{kpi.label}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400">
        Last activity: {summary.lastActivityAt ? formatPHT(summary.lastActivityAt, true) : 'none yet'}
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
            <ClipboardList className="w-4 h-4 text-gray-400" />
            <h3 className="font-semibold text-gray-900 text-sm">Work orders by status</h3>
          </div>
          {statuses.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400">No work orders yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {statuses.map(([status, count]) => (
                <li key={status} className="flex items-center justify-between px-5 py-2.5">
                  <StatusBadge status={status as WorkOrderStatus} />
                  <span className="text-sm font-medium text-gray-700">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
            <Activity className="w-4 h-4 text-gray-400" />
            <h3 className="font-semibold text-gray-900 text-sm">Recent workflow events</h3>
          </div>
          {events.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400">No events yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {events.map((event) => (
                <li key={event.id} className="px-5 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {event.work_order_id ? (
                      <Link href={`/${slug}/work-orders/${event.work_order_id}`} className="font-medium text-blue-700 hover:underline">
                        {event.wo_number}
                      </Link>
                    ) : null}
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

      <section className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <ScrollText className="w-4 h-4 text-gray-400" />
          <h3 className="font-semibold text-gray-900 text-sm">Audit log</h3>
        </div>
        {audit.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-400">No audit entries yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {audit.map((entry) => (
              <li key={entry.id} className="px-5 py-2.5 text-sm text-gray-700">
                <span className="text-xs text-gray-400 mr-2">{formatPHT(entry.created_at, true)}</span>
                {describeAuditEntry(entry)}
                {entry.metadata?.actor_role === 'provider' && (
                  <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">provider</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
