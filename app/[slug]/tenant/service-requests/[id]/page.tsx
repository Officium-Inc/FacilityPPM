import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Ban, ClipboardCheck, FileDown, FileText, ImageIcon } from 'lucide-react'
import StatusBadge from '@/components/work-orders/StatusBadge'
import {
  getTenantApprovalHref,
  getTenantPortalContext,
  isAwaitingTenant,
  isTenantOwnedRequest,
  rowsOf,
  type TenantRequestRow,
} from '@/lib/tenant'
import { getPriorityOption } from '@/lib/priority'
import { formatPHT } from '@/lib/utils'

interface Props {
  params: Promise<{ slug: string; id: string }>
}

export default async function TenantServiceRequestDetailPage({ params }: Props) {
  const { slug, id } = await params
  const context = await getTenantPortalContext(slug)

  const { data } = await context.service
    .from('work_orders')
    .select(`
      id,
      property_id,
      requested_by_id,
      wo_number,
      status,
      priority,
      type,
      created_at,
      updated_at,
      tenant_name,
      tenant_email,
      costing_token,
      sign_off_token,
      audit_report_url,
      cancellation_reason,
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
    .maybeSingle()

  const request = data as unknown as TenantRequestRow | null
  if (!request || request.property_id !== context.property.id || !isTenantOwnedRequest(request, context)) {
    notFound()
  }

  const report = rowsOf(request.work_order_reports)[0]
  const photos = (report?.photo_urls ?? []).filter(Boolean)
  const isApproval = isAwaitingTenant(request)
  const approvalHref = getTenantApprovalHref(slug, request)
  const detailHref = `/${slug}/tenant/service-requests/${request.id}`
  const hasApprovalLink = approvalHref !== detailHref
  const priority = getPriorityOption(report?.urgency ?? request.priority)
  const auditHref = request.status === 'completed'
    ? request.audit_report_url ?? `/api/pdf/${request.id}/audit`
    : null

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
                  This report is waiting for your approval or sign-off.
                </p>
              </div>
            </div>
            {hasApprovalLink ? (
              <Link
                href={approvalHref}
                className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
              >
                Review Report
              </Link>
            ) : (
              <p className="text-sm font-medium text-amber-800">Approval link pending</p>
            )}
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

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5 text-green-700" />
          <h3 className="text-sm font-semibold text-gray-900">Report Details</h3>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <Detail label="Tenant / Lessee" value={report?.tenant_lessee ?? '-'} />
          <Detail label="Contact Person" value={report?.reported_by_name ?? context.engineer.full_name} />
          <Detail label="Telephone / Email" value={report?.reported_by_contact ?? context.engineer.email ?? '-'} />
          <Detail label="Unit / Location" value={report?.location_notes ?? '-'} />
          <Detail label="Description of Work Requested" value={report?.fault_description ?? '-'} wide />
          <Detail
            label="Priority"
            value={priority ? `${priority.label} (${priority.sla})` : 'Not assessed yet - an engineer will set this after inspection'}
          />
          <Detail label="Last Updated" value={formatPHT(request.updated_at, true)} />
        </dl>
      </div>

      {photos.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-green-700" />
            <h3 className="text-sm font-semibold text-gray-900">Photos ({photos.length})</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((url, index) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Report photo ${index + 1}`} className="aspect-square w-full object-cover transition-transform hover:scale-105" />
              </a>
            ))}
          </div>
        </div>
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
