import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import CostingApprovalPage from '@/components/work-orders/CostingApprovalPage'
import SignOffPage from '@/components/sign-off/SignOffPage'
import { getTenantPortalContext } from '@/lib/tenant'
import { can } from '@/lib/authz/permissions'
import {
  SIGN_OFF_VIEW_SELECT,
  costingDecisionBlocker,
  loadSignOffEvidence,
  signOffDecisionBlocker,
  type CostingDecisionRecord,
  type SignOffDecisionRecord,
} from '@/lib/approval-rules'
import type { WorkOrder, WorkOrderCosting } from '@/types'
import { withFileRouteUrls } from '@/lib/storage-urls'

interface Props {
  params: Promise<{ slug: string; id: string }>
}

/** In-portal cost approval and sign-off for the tenant's company, replacing the emailed links. */
export default async function TenantRequestReviewPage({ params }: Props) {
  const { slug, id } = await params
  const context = await getTenantPortalContext(slug)
  const { service, actor, property } = context

  const { data } = await service
    .from('work_orders')
    .select(`${SIGN_OFF_VIEW_SELECT}, properties(name)`)
    .eq('id', id)
    .eq('property_id', property.id)
    .maybeSingle()

  const workOrder = data as (WorkOrder & { properties?: { name?: string } | null }) | null
  if (!workOrder || !can(actor, 'workRequest.approve', workOrder)) notFound()

  const detailHref = `/${slug}/tenant/service-requests/${id}`
  const back = (
    <Link href={detailHref} className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700">
      <ArrowLeft className="h-4 w-4" />
      Back to report
    </Link>
  )

  if (workOrder.status === 'pending_approval') {
    if (costingDecisionBlocker(workOrder as unknown as CostingDecisionRecord, false)) redirect(detailHref)

    const { data: costingRows } = await service
      .from('work_order_costings')
      .select('labour_hours, labour_rate, labour_total, materials_total, subcontractor_total, grand_total, line_items, notes')
      .eq('work_order_id', id)
      .limit(1)

    return (
      <div className="mx-auto max-w-2xl space-y-4">
        {back}
        <CostingApprovalPage
          embedded
          endpoint={`/api/work-orders/${id}/costing-decision`}
          successHref={`${detailHref}?done=costing`}
          woNumber={workOrder.wo_number}
          propertyName={workOrder.properties?.name ?? property.name}
          costing={(costingRows?.[0] ?? null) as WorkOrderCosting | null}
          defaultName={actor.name}
        />
      </div>
    )
  }

  if (signOffDecisionBlocker(workOrder as unknown as SignOffDecisionRecord, false)) redirect(detailHref)

  // The page payload does not need the link token hashes; files go through the authenticated file route
  const { reviewOrder, workDescription, allPhotos, allDocs } = withFileRouteUrls({
    ...(await loadSignOffEvidence(service, workOrder)),
    reviewOrder: { ...workOrder, sign_off_token_hash: null, costing_token_hash: null } as WorkOrder,
  })

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {back}
      <SignOffPage
        embedded
        workOrder={reviewOrder}
        workDescription={workDescription}
        allPhotos={allPhotos}
        allDocs={allDocs}
        endpoint={`/api/work-orders/${id}/sign-off-decision`}
        successHref={`${detailHref}?done=signed`}
        rejectedHref={`${detailHref}?done=sign-off-rejected`}
        defaultName={actor.name}
      />
    </div>
  )
}
