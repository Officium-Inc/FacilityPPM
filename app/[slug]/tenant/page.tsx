import Link from 'next/link'
import { CheckCircle, ClipboardCheck, ClipboardList, Clock } from 'lucide-react'
import NewTenantServiceRequestModal from '@/components/tenant/NewTenantServiceRequestModal'
import TenantActionPanel, { type TenantActionItem } from '@/components/tenant/TenantActionPanel'
import TenantRequestList from '@/components/tenant/TenantRequestList'
import TenantStatCard from '@/components/tenant/TenantStatCard'
import {
  getLatestEstimateTotals,
  getTenantPortalContext,
  getTenantRequestModalProps,
  getTenantServiceRequests,
  toTenantRequestListItem,
} from '@/lib/tenant'
import { countTenantRequests, tenantRequestsHref } from '@/lib/tenant-requests'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function TenantDashboardPage({ params }: Props) {
  const { slug } = await params
  const context = await getTenantPortalContext(slug)
  const [requests, modalProps] = await Promise.all([
    getTenantServiceRequests(context),
    getTenantRequestModalProps(context, slug),
  ])

  const counts = countTenantRequests(requests)
  const items = requests.map((row) => toTenantRequestListItem(slug, row))
  const waiting = items.filter((item) => item.action !== null)
  const estimateTotals = await getLatestEstimateTotals(
    context,
    waiting.filter((item) => item.action === 'cost_approval').map((item) => item.id)
  )
  const actionItems: TenantActionItem[] = waiting.flatMap((item) =>
    item.action
      ? [{ ...item, action: item.action, estimateTotal: item.action === 'cost_approval' ? estimateTotals.get(item.id) ?? null : null }]
      : []
  )
  const recent = items.slice(0, 5)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Tenant Dashboard</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {modalProps.companyName ? `Service reports and approvals for ${modalProps.companyName}.` : 'Track your service reports and approvals.'}
          </p>
        </div>
        <NewTenantServiceRequestModal {...modalProps} />
      </div>

      <TenantActionPanel items={actionItems} allHref={tenantRequestsHref(slug, 'for-my-approval')} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <TenantStatCard
          href={tenantRequestsHref(slug, 'for-my-approval')}
          title="For My Approval"
          value={counts['for-my-approval']}
          subtitle={counts['for-my-approval'] > 0 ? 'Waiting for your review' : 'Nothing waiting for you'}
          icon={ClipboardCheck}
          tone="amber"
          highlight={counts['for-my-approval'] > 0}
        />
        <TenantStatCard
          href={tenantRequestsHref(slug, 'pending')}
          title="Pending"
          value={counts.pending}
          subtitle="In progress with the property team"
          icon={Clock}
          tone="sky"
        />
        <TenantStatCard
          href={tenantRequestsHref(slug, 'complete')}
          title="Complete"
          value={counts.complete}
          subtitle="Signed off and completed"
          icon={CheckCircle}
          tone="green"
        />
        <TenantStatCard
          href={tenantRequestsHref(slug, 'my-requests')}
          title="All Reports"
          value={counts['my-requests']}
          subtitle="Submitted by your company"
          icon={ClipboardList}
          tone="green"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-4 sm:px-5">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Recent Service Reports</h3>
            <p className="mt-0.5 text-xs text-gray-500">Your company&apos;s latest reports.</p>
          </div>
          <Link href={tenantRequestsHref(slug, 'my-requests')} className="shrink-0 text-sm font-medium text-green-700 hover:underline">
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
          <TenantRequestList items={recent} showPriority={false} />
        )}
      </div>
    </div>
  )
}
