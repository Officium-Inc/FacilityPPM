import { ClipboardList } from 'lucide-react'
import NewTenantServiceRequestModal from '@/components/tenant/NewTenantServiceRequestModal'
import TenantRequestList from '@/components/tenant/TenantRequestList'
import TenantRequestTabs from '@/components/tenant/TenantRequestTabs'
import {
  getTenantPortalContext,
  getTenantRequestModalProps,
  getTenantServiceRequests,
  toTenantRequestListItem,
} from '@/lib/tenant'
import { countTenantRequests, matchesTenantFilter, type TenantRequestFilter } from '@/lib/tenant-requests'

const EMPTY_MESSAGES: Record<TenantRequestFilter, string> = {
  'my-requests': 'No service reports submitted yet.',
  pending: 'No reports in progress right now.',
  'for-my-approval': 'Nothing is waiting for your approval.',
  complete: 'No completed reports yet.',
  cancelled: 'No cancelled reports.',
}

export default async function ServiceRequestsView({
  slug,
  filter,
}: {
  slug: string
  filter: TenantRequestFilter
}) {
  const context = await getTenantPortalContext(slug)
  const [requests, modalProps] = await Promise.all([
    getTenantServiceRequests(context),
    getTenantRequestModalProps(context, slug),
  ])
  const counts = countTenantRequests(requests)
  const items = requests
    .filter((row) => matchesTenantFilter(row, filter))
    .map((row) => toTenantRequestListItem(slug, row))

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Service Reports</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {modalProps.companyName ? `Reports ${modalProps.companyName} sent to the property team.` : 'Reports your company sent to the property team.'}
          </p>
        </div>
        <NewTenantServiceRequestModal {...modalProps} />
      </div>

      <TenantRequestTabs slug={slug} active={filter} counts={counts} />

      {items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <ClipboardList className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-500">{EMPTY_MESSAGES[filter]}</p>
          {(filter === 'my-requests' || filter === 'pending') && (
            <div className="mt-4">
              <NewTenantServiceRequestModal
                {...modalProps}
                triggerLabel="Submit a service report"
                variant="link"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <TenantRequestList items={items} searchable />
        </div>
      )}
    </div>
  )
}
