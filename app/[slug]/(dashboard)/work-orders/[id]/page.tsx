import { createClient, createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import StatusBadge from '@/components/work-orders/StatusBadge'
import ChecklistItemComponent from '@/components/work-orders/ChecklistItem'
import WorkOrderActions from '@/components/work-orders/WorkOrderActions'
import WorkflowTimeline from '@/components/work-orders/WorkflowTimeline'
import { format } from 'date-fns'
import type { WorkOrder, Engineer, ApprovalTrailEntry } from '@/types'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface Props {
  params: Promise<{ slug: string; id: string }>
}

export default async function WorkOrderDetailPage({ params }: Props) {
  const { slug, id } = await params
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: wo, error: woError } = await supabase
    .from('work_orders')
    .select(`
      *,
      engineers(id, full_name, email, phone),
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

  // Fetch approval trail + engineers list (service client for broader access)
  const [{ data: trailData }, { data: engineersList }] = await Promise.all([
    service.from('approval_trail').select('*').eq('work_order_id', id).order('created_at'),
    service.from('engineers').select('id, full_name, email, is_active').eq('property_id', wo.property_id).eq('is_active', true),
  ])

  const workOrder = wo as WorkOrder
  const asset = workOrder.ppm_schedules?.assets
  const site = asset?.buildings?.sites
  const checklist = (workOrder.checklist_items ?? []).sort(
    (a, b) => a.sort_order - b.sort_order
  )

  type ReportRow = { fault_description?: string; location_notes?: string; reported_by_name?: string; reported_by_contact?: string; urgency?: string; inspection_notes?: string; root_cause?: string; scope_of_work?: string }
  type CostingRow = { labour_hours?: number; labour_rate?: number; labour_total?: number; materials_total?: number; subcontractor_total?: number; grand_total?: number; notes?: string }
  type EvidenceRow = { work_description?: string }

  const report = ((wo as Record<string, unknown>).work_order_reports as ReportRow[] | null) ?? []
  const costing = ((wo as Record<string, unknown>).work_order_costings as CostingRow[] | null) ?? []
  const evidence = ((wo as Record<string, unknown>).work_order_completion_evidence as EvidenceRow[] | null) ?? []
  const approvalTrail = (trailData ?? []) as ApprovalTrailEntry[]
  const engineers = (engineersList ?? []) as Engineer[]

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
                  <Detail label="Approved By" value={`${workOrder.costing_approved_by_name}${workOrder.costing_approved_at ? ` on ${format(new Date(workOrder.costing_approved_at), 'dd MMM yyyy')}` : ''}`} />
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
              <Detail
                label="Scheduled Date"
                value={
                  workOrder.scheduled_date
                    ? format(new Date(workOrder.scheduled_date), 'dd MMM yyyy')
                    : '—'
                }
              />
              {workOrder.due_date && <Detail label="Due Date" value={format(new Date(workOrder.due_date), 'dd MMM yyyy')} />}
              {workOrder.completed_date && (
                <Detail label="Completed Date" value={format(new Date(workOrder.completed_date), 'dd MMM yyyy HH:mm')} />
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
        </div>

        <div>
          <WorkOrderActions workOrder={workOrder} engineers={engineers} slug={slug} />
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

