import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import StatusBadge from '@/components/work-orders/StatusBadge'
import NewTenantServiceRequestModal from '@/components/tenant/NewTenantServiceRequestModal'
import {
  getTenantApprovalHref,
  getTenantPortalContext,
  getTenantServiceRequests,
  isAwaitingTenant,
  rowsOf,
  TENANT_REQUEST_TITLES,
  type TenantRequestFilter,
} from '@/lib/tenant'
import { priorityLabel } from '@/lib/priority'
import { formatPHT } from '@/lib/utils'

export default async function ServiceRequestsView({
  slug,
  filter,
}: {
  slug: string
  filter: TenantRequestFilter
}) {
  const context = await getTenantPortalContext(slug)
  const requests = await getTenantServiceRequests(context, filter)
  const title = TENANT_REQUEST_TITLES[filter]
  const modalProps = {
    slug,
    defaultName: context.engineer.full_name,
    defaultContact: context.engineer.email || (context.user.email ?? ''),
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          <p className="mt-0.5 text-sm text-gray-500">{requests.length} service report{requests.length === 1 ? '' : 's'}</p>
        </div>
        <NewTenantServiceRequestModal {...modalProps} />
      </div>

      {requests.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <ClipboardList className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-500">No service reports found in this view.</p>
          <div className="mt-4">
            <NewTenantServiceRequestModal
              {...modalProps}
              triggerLabel="Submit a service report"
              variant="link"
            />
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Report', 'Description', 'Location', 'Priority', 'Status', 'Submitted', 'Action'].map((heading) => (
                    <th key={heading} className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {requests.map((row) => {
                  const report = rowsOf(row.work_order_reports)[0]
                  const awaiting = isAwaitingTenant(row)
                  const href = awaiting
                    ? getTenantApprovalHref(slug, row)
                    : `/${slug}/tenant/service-requests/${row.id}`
                  const priority = report?.urgency ?? row.priority

                  return (
                    <tr key={row.id} className="transition-colors hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <Link
                          href={`/${slug}/tenant/service-requests/${row.id}`}
                          className="font-medium text-green-700 hover:underline"
                        >
                          {row.wo_number}
                        </Link>
                      </td>
                      <td className="max-w-xs truncate px-5 py-3 text-gray-700">
                        {report?.fault_description ?? '-'}
                      </td>
                      <td className="px-5 py-3 text-gray-600">{report?.location_notes ?? '-'}</td>
                      <td className={priority ? 'px-5 py-3 text-gray-600' : 'px-5 py-3 text-gray-400'}>
                        {priorityLabel(priority)}
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
        </div>
      )}
    </div>
  )
}
