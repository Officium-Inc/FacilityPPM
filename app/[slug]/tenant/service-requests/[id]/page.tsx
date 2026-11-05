import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Ban, CheckCircle, ClipboardCheck, FileDown } from 'lucide-react'
import StatusBadge from '@/components/work-orders/StatusBadge'
import WorkOrderFormView from '@/components/work-orders/WorkOrderFormView'
import TenantCancelRequest from '@/components/tenant/TenantCancelRequest'
import TenantProgressTracker from '@/components/tenant/TenantProgressTracker'
import { buildTenantProgress } from '@/lib/tenant-progress'
import { loadWorkOrderForm } from '@/lib/work-order-form'
import {
  getTenantApprovalHref,
  getTenantPortalContext,
  isAwaitingTenant,
  isTenantOwnedRequest,
  rowsOf,
  type TenantRequestRow,
} from '@/lib/tenant'
import { can } from '@/lib/authz/permissions'
import { getPriorityOption } from '@/lib/priority'
import { formatPHT } from '@/lib/utils'
import { fileRouteUrl, withFileRouteUrls } from '@/lib/storage-urls'

interface Props {
  params: Promise<{ slug: string; id: string }>
  searchParams: Promise<{ done?: string; action?: string }>
}

/** Extra columns for the progress tracker (dates and the assigned engineer's name only). */
interface ProgressColumns {
  due_date: string | null
  costing_approved_at: string | null
  head_engineer_verified_at: string | null
  signed_at: string | null
  completed_date: string | null
  engineers: { full_name: string | null } | { full_name: string | null }[] | null
}

const DONE_MESSAGES: Record<string, string> = {
  'costing:approve': 'Cost estimate approved. The engineering team will schedule the work.',
  'costing:reject': 'Cost estimate rejected. The engineering team will revise it.',
  signed: 'Thank you. The work has been signed off.',
  'sign-off-rejected': 'Your rejection was sent to the engineering team. They will follow up on the work.',
}

export default async function TenantServiceRequestDetailPage({ params, searchParams }: Props) {
  const { slug, id } = await params
  const { done, action } = await searchParams
  const context = await getTenantPortalContext(slug)

  const { data } = await context.service
    .from('work_orders')
    .select(`
      id,
      property_id,
      company_id,
      floor_id,
      requested_by_id,
      wo_number,
      status,
      priority,
      type,
      created_at,
      updated_at,
      tenant_name,
      tenant_email,
      sign_off_token_hash,
      audit_report_url,
      cancellation_reason,
      due_date,
      costing_approved_at,
      head_engineer_verified_at,
      signed_at,
      completed_date,
      engineers!work_orders_engineer_id_fkey(full_name),
      floors(label),
      work_order_reports!work_order_reports_work_order_id_fkey(
        id,
        fault_description,
        location_notes,
        reported_by_name,
        reported_by_contact,
        tenant_lessee,
        urgency,
        photo_urls,
        created_at
      )
    `)
    .eq('id', id)
    .eq('property_id', context.property.id)
    .maybeSingle()

  const request = data as unknown as (TenantRequestRow & ProgressColumns) | null
  if (!request || request.property_id !== context.property.id || !isTenantOwnedRequest(request, context)) {
    notFound()
  }

  // Event types and times only: reasons and actor details stay with the property team
  const { data: events } = await context.service
    .from('work_order_events')
    .select('event_type, created_at')
    .eq('work_order_id', request.id)

  const progress = buildTenantProgress({
    status: request.status,
    hasSignOffLink: Boolean(request.sign_off_token_hash),
    createdAt: request.created_at,
    updatedAt: request.updated_at,
    costingApprovedAt: request.costing_approved_at,
    verifiedAt: request.head_engineer_verified_at,
    signedAt: request.signed_at,
    completedAt: request.completed_date,
    dueDate: request.due_date,
    engineerName: rowsOf(request.engineers)[0]?.full_name ?? null,
    events: events ?? [],
  })

  const report = rowsOf(request.work_order_reports)[0]
  const isApproval = isAwaitingTenant(request)
  const approvalHref = getTenantApprovalHref(slug, request)
  const canWithdraw = request.status === 'new_report' && can(context.actor, 'workRequest.cancel', request)
  const floorLabel = rowsOf(request.floors)[0]?.label ?? null
  const location = [floorLabel, report?.location_notes?.trim()].filter(Boolean).join(' · ')
  const photos = (report?.photo_urls ?? []).filter((url) => typeof url === 'string' && url.length > 0).map((url) => fileRouteUrl(url))
  const doneMessage = done ? DONE_MESSAGES[done === 'costing' ? `costing:${action}` : done] : undefined
  const priority = getPriorityOption(report?.urgency ?? request.priority)
  const auditHref = request.status === 'completed'
    ? (request.audit_report_url ? fileRouteUrl(request.audit_report_url) : `/api/pdf/${request.id}/audit`)
    : null
  // Ownership was verified above, so the tenant may see their own captured signatures
  const formData = withFileRouteUrls(await loadWorkOrderForm(context.service, request.id, { includeSignatures: true }))

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href={`/${slug}/tenant/service-requests/my-requests`}
          className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to reports
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{request.wo_number}</h2>
            <p className="mt-0.5 text-sm text-gray-500">Submitted {formatPHT(request.created_at, true)}</p>
          </div>
          <StatusBadge status={request.status} />
        </div>
      </div>

      {doneMessage && (
        <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-green-700" />
          <p>{doneMessage}</p>
        </div>
      )}

      {canWithdraw && <TenantCancelRequest workOrderId={request.id} />}

      {request.status === 'cancelled' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-red-100 p-2 text-red-700">
              <Ban className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-red-900">This report was cancelled</h3>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-red-800">
                {request.cancellation_reason ?? 'No reason was provided.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {isApproval && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-lg bg-amber-100 p-2 text-amber-700">
                <ClipboardCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-amber-900">Action needed</h3>
                <p className="mt-0.5 text-sm text-amber-800">
                  {request.status === 'pending_approval'
                    ? 'The cost estimate for this report is waiting for your approval.'
                    : 'The work is done and waiting for your sign-off.'}
                </p>
              </div>
            </div>
            <Link
              href={approvalHref}
              className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
            >
              {request.status === 'pending_approval' ? 'Review Estimate' : 'Review & Sign Off'}
            </Link>
          </div>
        </div>
      )}

      {auditHref && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-lg bg-green-100 p-2 text-green-700">
                <FileDown className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-green-900">Audit report ready</h3>
                <p className="mt-0.5 text-sm text-green-800">
                  The full timeline of work for this report, from submission to sign-off.
                </p>
              </div>
            </div>
            <a
              href={auditHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-800"
            >
              Download Audit Report
            </a>
          </div>
        </div>
      )}

      {request.status !== 'cancelled' && <TenantProgressTracker progress={progress} />}

      <section className="rounded-xl border border-gray-200 bg-white p-5" aria-labelledby="request-details-title">
        <h3 id="request-details-title" className="text-sm font-semibold text-gray-900">Request details</h3>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <Detail label="Description" value={report?.fault_description?.trim() || '-'} wide />
          {location && <Detail label="Location" value={location} />}
          <Detail
            label="Priority"
            value={priority ? `${priority.label} (${priority.sla})` : 'Not assessed yet - an engineer will set this after inspection'}
          />
          {report?.reported_by_name && <Detail label="Submitted By" value={report.reported_by_name} />}
          <Detail label="Last Updated" value={formatPHT(request.updated_at, true)} />
        </dl>
        {photos.length > 0 && (
          <div className="mt-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Photos</p>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {photos.map((url, index) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded-lg border border-gray-200 transition-opacity hover:opacity-90"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Photo ${index + 1} of the reported issue`} className="aspect-square w-full object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}
      </section>

      {formData && (
        <WorkOrderFormView data={formData} pdfHref={`/api/pdf/${request.id}/report`} defaultOpen={false} />
      )}
    </div>
  )
}

function Detail({
  label,
  value,
  wide,
}: {
  label: string
  value: string
  wide?: boolean
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-gray-800">{value}</dd>
    </div>
  )
}
