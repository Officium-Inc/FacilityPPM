import { createClient, createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import StatusBadge from '@/components/work-orders/StatusBadge'
import ChecklistItemComponent from '@/components/work-orders/ChecklistItem'
import WorkOrderActions from '@/components/work-orders/WorkOrderActions'
import WorkflowTimeline from '@/components/work-orders/WorkflowTimeline'
import WoCommentsSection from '@/components/work-orders/WoCommentsSection'
import type { WoComment, MentionableEngineer } from '@/components/work-orders/WoCommentsSection'
import { formatPHT } from '@/lib/utils'
import type { WorkOrder, Engineer, ApprovalTrailEntry } from '@/types'
import { ArrowLeft, FileText, Ban, FileDown, Image as ImageIcon } from 'lucide-react'
import Link from 'next/link'

interface Props {
  params: Promise<{ slug: string; id: string }>
}

export default async function WorkOrderDetailPage({ params }: Props) {
  const { slug, id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: wo, error: woError } = await service
    .from('work_orders')
    .select(`
      *,
      engineers!work_orders_engineer_id_fkey(id, full_name, email, phone),
      ppm_schedules(
        id, title, frequency,
        assets(
          id, name, category, make, model, location,
          buildings(id, name, sites(id, name, address, city))
        )
      ),
      checklist_items(*),
      work_order_reports!work_order_reports_work_order_id_fkey(*),
      work_order_costings!work_order_costings_work_order_id_fkey(*),
      work_order_completion_evidence!work_order_completion_evidence_work_order_id_fkey(*)
    `)
    .eq('id', id)
    .single()

  if (woError) console.error('[WO detail] query error:', woError)
  if (!wo) notFound()

  // Fetch approval trail, engineers list, schedules, and comments
  const [{ data: trailData }, { data: engineersList }, { data: rawSchedules }, { data: rawComments }] = await Promise.all([
    service.from('approval_trail').select('*').eq('work_order_id', id).order('created_at'),
    service.from('engineers').select('id, full_name, email, is_active, roles(id, name)').eq('property_id', wo.property_id).eq('is_active', true),
    service.from('ppm_schedules').select('id, title, assets(id, name)').eq('is_active', true).order('title'),
    service.from('work_order_comments').select('id, author_name, author_role, message, created_at').eq('work_order_id', id).order('created_at', { ascending: true }),
  ])

  const schedules = (rawSchedules ?? []).map((s) => ({
    id: s.id as string,
    title: s.title as string,
    assets: Array.isArray(s.assets) ? (s.assets[0] as { id: string; name: string } | undefined) ?? null : (s.assets as { id: string; name: string } | null),
  }))

  const workOrder = wo as WorkOrder
  const asset = workOrder.ppm_schedules?.assets
  const site = asset?.buildings?.sites
  const checklist = (workOrder.checklist_items ?? []).sort(
    (a, b) => a.sort_order - b.sort_order
  )

  type ReportRow = { fault_description?: string; location_notes?: string; reported_by_name?: string; reported_by_contact?: string; urgency?: string; inspection_notes?: string; root_cause?: string; scope_of_work?: string; photo_urls?: string[] | null; inspection_photo_urls?: string[] | null }
  type CostingRow = { labour_hours?: number; labour_rate?: number; labour_total?: number; materials_total?: number; subcontractor_total?: number; grand_total?: number; notes?: string }
  type EvidenceRow = { work_description?: string; completion_photo_urls?: string[] | null; supporting_doc_urls?: string[] | null }

  const report = ((wo as Record<string, unknown>).work_order_reports as ReportRow[] | null) ?? []
  const costing = ((wo as Record<string, unknown>).work_order_costings as CostingRow[] | null) ?? []
  const evidence = ((wo as Record<string, unknown>).work_order_completion_evidence as EvidenceRow[] | null) ?? []
  const approvalTrail = (trailData ?? []) as ApprovalTrailEntry[]
  const engineers = (engineersList ?? []) as unknown as Engineer[]
  const comments = (rawComments ?? []) as WoComment[]
  const mentionables: MentionableEngineer[] = (engineersList ?? []).map((e) => ({
    id: e.id,
    full_name: (e as { id: string; full_name: string }).full_name,
  }))

  return (
    <div className="space-y-6 max-w-5xl">
      <Link
        href={`/${slug}/work-orders`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Work Orders
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold text-gray-900">{workOrder.wo_number}</h2>
            <StatusBadge status={workOrder.status} />
            {workOrder.is_cost_waived && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                <Ban className="w-3 h-3" /> Cost Waived
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1 capitalize">
            {workOrder.type} · {workOrder.priority} priority
          </p>
        </div>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          {/* Workflow timeline */}
          <WorkflowTimeline workOrder={workOrder} approvalTrail={approvalTrail} />

          {/* Fault report */}
          {report && report.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 text-sm mb-4">Fault Report</h3>
              <dl className="space-y-2 text-sm">
                <Detail label="Description" value={report[0].fault_description ?? '—'} />
                {report[0].location_notes ? <Detail label="Location" value={report[0].location_notes} /> : null}
                <Detail label="Reported By" value={report[0].reported_by_name ?? '—'} />
                {report[0].reported_by_contact ? <Detail label="Contact" value={report[0].reported_by_contact} /> : null}
                <Detail label="Urgency" value={report[0].urgency ?? '—'} />
                {report[0].inspection_notes ? (
                  <>
                    <div className="border-t border-gray-100 pt-2 mt-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Inspection Findings</p>
                    </div>
                    <Detail label="Notes" value={report[0].inspection_notes} />
                    {report[0].root_cause ? <Detail label="Root Cause" value={report[0].root_cause} /> : null}
                    {report[0].scope_of_work ? <Detail label="Scope of Work" value={report[0].scope_of_work} /> : null}
                  </>
                ) : null}
              </dl>
            </div>
          )}

          {/* Costing */}
          {costing && costing.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 text-sm mb-4">Cost Estimate</h3>
              <dl className="space-y-1 text-sm">
                <Detail label="Labour" value={`${costing[0].labour_hours ?? 0}h × ₱${costing[0].labour_rate ?? 0}/h = ₱${Number(costing[0].labour_total ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} />
                <Detail label="Materials" value={`₱${Number(costing[0].materials_total ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} />
                <Detail label="Subcontractor" value={`₱${Number(costing[0].subcontractor_total ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} />
                <Detail label="Grand Total" value={`₱${Number(costing[0].grand_total ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} />
                {costing[0].notes ? <Detail label="Notes" value={costing[0].notes} /> : null}
                {workOrder.costing_approved_by_name && (
                  <Detail label="Approved By" value={`${workOrder.costing_approved_by_name}${workOrder.costing_approved_at ? ` on ${formatPHT(workOrder.costing_approved_at)}` : ''}`} />
                )}
              </dl>
            </div>
          )}

          {/* Completion evidence */}
          {evidence && evidence.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 text-sm mb-4">Completion Evidence</h3>
              <dl className="space-y-2 text-sm">
                <Detail label="Work Done" value={String(evidence[0].work_description ?? '—')} />
                {workOrder.hours_logged && <Detail label="Hours Logged" value={`${workOrder.hours_logged}h`} />}
              </dl>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 text-sm mb-4">Work Order Details</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Detail label="Property" value={site?.name ?? '—'} />
              <Detail label="Address" value={site ? `${site.address}, ${site.city}` : '—'} />
              <Detail label="Building" value={asset?.buildings?.name ?? '—'} />
              <Detail label="Asset" value={asset?.name ?? '—'} />
              <Detail label="Category" value={asset?.category ?? '—'} />
              <Detail label="Make / Model" value={asset ? `${asset.make} ${asset.model}` : '—'} />
              <Detail label="Location" value={asset?.location ?? '—'} />
              <Detail label="Schedule" value={workOrder.ppm_schedules?.title ?? '—'} />
              <Detail label="Engineer" value={workOrder.engineers?.full_name ?? 'Unassigned'} />
              {workOrder.original_wo_number && (
                <Detail label="Original Report No." value={workOrder.original_wo_number} />
              )}
              <Detail
                label="Scheduled Date"
                value={formatPHT(workOrder.scheduled_date)}
              />
              {workOrder.due_date && <Detail label="Due Date" value={formatPHT(workOrder.due_date)} />}
              {workOrder.completed_date && (
                <Detail label="Completed Date" value={formatPHT(workOrder.completed_date, true)} />
              )}
              {workOrder.notes && <Detail label="Notes" value={workOrder.notes} />}
            </dl>
          </div>

          {checklist.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 text-sm mb-2">
                Checklist ({checklist.length} items)
              </h3>
              {checklist.map((item) => (
                <ChecklistItemComponent
                  key={item.id}
                  description={item.description}
                  result={item.result}
                  remarks={item.remarks}
                  photoUrls={item.photo_urls}
                  sortOrder={item.sort_order}
                />
              ))}
            </div>
          )}

          {/* ── Collated Attachments ────────────────────────────── */}
          {(() => {
            const photos = [
              ...(report[0]?.photo_urls?.map((u: string) => ({ url: u, label: 'Service Report' })) ?? []),
              ...(report[0]?.inspection_photo_urls?.map((u: string) => ({ url: u, label: 'Inspection' })) ?? []),
              ...(evidence[0]?.completion_photo_urls?.map((u: string) => ({ url: u, label: 'Completion' })) ?? []),
              ...checklist.flatMap(item =>
                (item.photo_urls ?? []).map((u: string) => ({ url: u, label: 'Checklist' }))
              ),
            ]
            const supportingDocs = evidence[0]?.supporting_doc_urls ?? []
            const hasReport = report.length > 0
            const hasCosting = costing.length > 0
            const hasReceipt = !!(workOrder.pdf_url || workOrder.signed_at)

            if (!hasReport && !hasCosting && !hasReceipt && photos.length === 0 && supportingDocs.length === 0) return null

            return (
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
                <h3 className="font-semibold text-gray-900 text-sm">Attachments</h3>

                {/* PDF Documents */}
                {(hasReport || hasCosting || hasReceipt) && (
                  <div>
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2.5">Documents</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {hasReport && (
                        <a
                          href={`/api/pdf/${workOrder.id}/report`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-green-400 hover:bg-green-50 transition-colors group"
                        >
                          <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <FileDown className="w-4 h-4 text-blue-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {report[0].inspection_notes ? 'Inspection Report' : 'Service Report'}
                            </p>
                            <p className="text-xs text-gray-400">PDF · Click to open</p>
                          </div>
                        </a>
                      )}
                      {hasCosting && (
                        <a
                          href={`/api/pdf/${workOrder.id}/costing`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-green-400 hover:bg-green-50 transition-colors group"
                        >
                          <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                            <FileDown className="w-4 h-4 text-green-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">Cost Estimate</p>
                            <p className="text-xs text-gray-400">
                              {workOrder.costing_approved_at ? 'Approved · PDF' : 'PDF · Click to open'}
                            </p>
                          </div>
                        </a>
                      )}
                      {hasReceipt && (
                        <a
                          href={workOrder.pdf_url ?? `/api/pdf/${workOrder.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-green-400 hover:bg-green-50 transition-colors group"
                        >
                          <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-4 h-4 text-purple-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">Signed Receipt</p>
                            <p className="text-xs text-gray-400">PDF · Tenant acknowledgement</p>
                          </div>
                        </a>
                      )}
                      {supportingDocs.map((url: string, i: number) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-green-400 hover:bg-green-50 transition-colors"
                        >
                          <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-4 h-4 text-gray-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">Supporting Doc {i + 1}</p>
                            <p className="text-xs text-gray-400">PDF · Click to open</p>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Photos */}
                {photos.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5" />
                      Photos ({photos.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {photos.map((p, i) => (
                        <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="relative group">
                          <img
                            src={p.url}
                            alt={`${p.label} photo ${i + 1}`}
                            className="w-24 h-24 object-cover rounded-lg border border-gray-200 group-hover:opacity-80 transition-opacity"
                          />
                          <span className="absolute bottom-1 left-1 text-[9px] font-medium bg-black/50 text-white rounded px-1 py-0.5">
                            {p.label}
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── Comments ────────────────────────────────────────── */}
          <WoCommentsSection workOrderId={workOrder.id} initialComments={comments} mentionables={mentionables} />
        </div>

        <div>
          <WorkOrderActions workOrder={workOrder} engineers={engineers} schedules={schedules} slug={slug} />
        </div>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</dt>
      <dd className="text-gray-800 mt-0.5">{value}</dd>
    </div>
  )
}

