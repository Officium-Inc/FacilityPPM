import Link from 'next/link'
import { AlertTriangle, CheckCircle, ClipboardCheck, ClipboardList } from 'lucide-react'
import KpiCard from '@/components/dashboard/KpiCard'
import StatusBadge from '@/components/work-orders/StatusBadge'
import NewTenantServiceRequestModal from '@/components/tenant/NewTenantServiceRequestModal'
import {
  getTenantApprovalHref,
  getTenantPortalContext,
  getTenantServiceRequests,
  isAwaitingTenant,
  rowsOf,
} from '@/lib/tenant'
import { formatPHT } from '@/lib/utils'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function TenantDashboardPage({ params }: Props) {
  const { slug } = await params
  const context = await getTenantPortalContext(slug)
  const requests = await getTenantServiceRequests(context)

  const approval = requests.filter(isAwaitingTenant)
  const pending = requests.filter(
    (row) =>
      ['new_report', 'inspecting', 'costing', 'assigned', 'in_progress', 'svc_submitted'].includes(row.status) &&
      !isAwaitingTenant(row)
  )
  const complete = requests.filter((row) => ['signed', 'completed'].includes(row.status))
  const recent = requests.slice(0, 5)
  const modalProps = {
    slug,
    defaultName: context.engineer.full_name,
    defaultContact: context.engineer.email || (context.user.email ?? ''),
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Tenant Dashboard</h2>
          <p className="mt-0.5 text-sm text-gray-500">Track your service reports and approvals.</p>
        </div>
        <NewTenantServiceRequestModal {...modalProps} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="My Reports"
          value={requests.length}
          subtitle="Total submitted"
          icon={ClipboardList}
          color="green"
        />
        <KpiCard
          title="Pending"
          value={pending.length}
          subtitle="In progress with the property team"
          icon={AlertTriangle}
          color="yellow"
        />
        <KpiCard
          title="For My Approval"
          value={approval.length}
          subtitle="Waiting for your review"
          icon={ClipboardCheck}
          color="blue"
        />
        <KpiCard
          title="Complete"
          value={complete.length}
          subtitle="Signed off and completed"
          icon={CheckCircle}
          color="green"
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Recent Service Reports</h3>
            <p className="mt-0.5 text-xs text-gray-500">Latest activity from your tenant portal.</p>
          </div>
          <Link href={`/${slug}/tenant/service-requests/my-requests`} className="text-sm font-medium text-green-700 hover:underline">
            View all
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <ClipboardList className="mx-auto mb-3 h-8 w-8 text-gray-300" />
            <p className="text-sm text-gray-500">No service reports submitted yet.</p>
            <div className="mt-4">
              <NewTenantServiceRequestModal
                {...modalProps}
                triggerLabel="Submit your first report"
                variant="link"
              />
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Report', 'Description', 'Status', 'Submitted', 'Action'].map((heading) => (
                    <th key={heading} className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recent.map((row) => {
                  const report = rowsOf(row.work_order_reports)[0]
                  const awaiting = isAwaitingTenant(row)
                  const href = awaiting
                    ? getTenantApprovalHref(slug, row)
                    : `/${slug}/tenant/service-requests/${row.id}`

                  return (
                    <tr key={row.id} className="transition-colors hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{row.wo_number}</td>
                      <td className="max-w-xs truncate px-5 py-3 text-gray-700">
                        {report?.fault_description ?? '-'}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-5 py-3 text-gray-500">{formatPHT(row.created_at)}</td>
                      <td className="px-5 py-3">
                        <Link href={href} className="font-medium text-green-700 hover:underline">
                          {awaiting ? 'Review' : 'View'}
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
