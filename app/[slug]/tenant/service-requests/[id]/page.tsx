import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ClipboardCheck, FileText } from 'lucide-react'
import StatusBadge from '@/components/work-orders/StatusBadge'
import {
  getTenantApprovalHref,
  getTenantPortalContext,
  isTenantOwnedRequest,
  rowsOf,
  type TenantRequestRow,
} from '@/lib/tenant'
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
      work_order_reports!work_order_reports_work_order_id_fkey(
        id,
        fault_description,
        location_notes,
        reported_by_name,
        reported_by_contact,
        urgency,
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
  const isApproval = request.status === 'pending_approval' || request.status === 'svc_submitted'
  const approvalHref = getTenantApprovalHref(slug, request)
  const detailHref = `/${slug}/tenant/service-requests/${request.id}`
  const hasApprovalLink = approvalHref !== detailHref

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href={`/${slug}/tenant/service-requests/my-requests`}
          className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to requests
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{request.wo_number}</h2>
            <p className="mt-0.5 text-sm text-gray-500">Submitted {formatPHT(request.created_at, true)}</p>
          </div>
          <StatusBadge status={request.status} />
        </div>
      </div>

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
                  This request is waiting for your approval or sign-off.
                </p>
              </div>
            </div>
            {hasApprovalLink ? (
              <Link
                href={approvalHref}
                className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
              >
                Review Request
              </Link>
            ) : (
              <p className="text-sm font-medium text-amber-800">Approval link pending</p>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5 text-green-700" />
          <h3 className="text-sm font-semibold text-gray-900">Request Details</h3>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <Detail label="Description" value={report?.fault_description ?? '-'} wide />
          <Detail label="Location / Unit" value={report?.location_notes ?? '-'} />
          <Detail label="Urgency" value={report?.urgency ?? request.priority} />
          <Detail label="Reported By" value={report?.reported_by_name ?? context.engineer.full_name} />
          <Detail label="Contact" value={report?.reported_by_contact ?? context.engineer.email ?? '-'} />
          <Detail label="Last Updated" value={formatPHT(request.updated_at, true)} />
        </dl>
      </div>
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
