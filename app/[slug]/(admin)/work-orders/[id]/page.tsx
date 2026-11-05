import { notFound } from 'next/navigation'
import ChecklistItemComponent from '@/components/work-orders/ChecklistItem'
import WorkOrderActions from '@/components/work-orders/WorkOrderActions'
import WorkOrderHeader from '@/components/work-orders/WorkOrderHeader'
import WorkflowSteps from '@/components/work-orders/WorkflowSteps'
import WorkOrderDetailsCard, { type DetailRow, type DetailsCost } from '@/components/work-orders/WorkOrderDetailsCard'
import ServiceReportFormDialog from '@/components/work-orders/ServiceReportFormDialog'
import WoCommentsSection from '@/components/work-orders/WoCommentsSection'
import { WorkOrderFormSheet } from '@/components/work-orders/WorkOrderFormView'
import { loadWorkOrderForm } from '@/lib/work-order-form'
import { getPropertyBySlug, requirePageRecord } from '@/lib/authz/guard'
import { can } from '@/lib/authz/permissions'
import { createServiceClient } from '@/lib/supabase/server'
import type { WoComment, MentionableEngineer } from '@/components/work-orders/WoCommentsSection'
import { formatPHT } from '@/lib/utils'
import { withFileRouteUrls } from '@/lib/storage-urls'
import { priorityLabel } from '@/lib/priority'
import { latestCosting, normalizeLineItems } from '@/lib/costing'
import { buildWorkflowSteps, type WorkflowInput } from '@/lib/work-order-workflow'
import type {
  WorkOrder,
  Engineer,
  WorkOrderCompletionEvidence,
  WorkOrderCosting,
  WorkOrderReport,
  WorkOrderType,
} from '@/types'

interface Props {
  params: Promise<{ slug: string; id: string }>
}

const TYPE_LABEL: Record<WorkOrderType, string> = {
  ppm: 'PPM',
  reactive: 'Reactive',
  statutory: 'Statutory',
  project: 'Project',
}

function rowsOf<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function shorten(value: string, max = 60) {
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

export default async function WorkOrderDetailPage({ params }: Props) {
  const { slug, id } = await params
  // Only load work orders of the property in the URL; access is then checked against the row itself
  const slugProperty = await getPropertyBySlug(slug)
  if (!slugProperty) notFound()
  const service = await createServiceClient()

  const { data: rawWo, error: woError } = await service
    .from('work_orders')
    .select(`
      *,
      engineers!work_orders_engineer_id_fkey(id, full_name, email, phone),
      tenant_companies(name),
      floors(label),
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
    .eq('property_id', slugProperty.id)
    .maybeSingle()

  if (woError) console.error('[WO detail] query error:', woError)
  const { actor } = await requirePageRecord(slug, 'workRequest.view', rawWo)
  if (!rawWo) notFound()
  // Files are private: the page links them through the authenticated file route.
  // The browser does not need the link token hashes, signatures or the signer's IP and device.
  const wo = withFileRouteUrls({
    ...rawWo,
    sign_off_token_hash: null,
    costing_token_hash: null,
    signature_data: null,
    costing_approval_signature: null,
    signed_by_ip: null,
    signed_by_device: null,
  })
  const permissions = {
    review: can(actor, 'workRequest.review', wo),
    inspect: can(actor, 'workRequest.inspect', wo),
    assign: can(actor, 'workRequest.assign', wo),
    execute: can(actor, 'workRequest.execute', wo),
    cancel: can(actor, 'workRequest.cancel', wo),
  }
  const canComment = can(actor, 'workRequest.comment', wo)

  // Workflow history, engineers list and comments
  const [{ data: trailData }, { data: eventRows }, { data: engineersList }, { data: rawComments }] = await Promise.all([
    service.from('approval_trail').select('stage, actor_name, actor_role, decision, reason, created_at').eq('work_order_id', id).order('created_at'),
    service.from('work_order_events').select('event_type, step, actor_name, actor_role, decision, reason, metadata, created_at').eq('work_order_id', id).order('created_at'),
    service.from('engineers').select('id, full_name, email, is_active, roles(id, name)').eq('property_id', wo.property_id).eq('is_active', true),
    service.from('work_order_comments').select('id, author_name, author_role, message, created_at').eq('work_order_id', id).order('created_at', { ascending: true }),
  ])

  const workOrder = wo as WorkOrder
  const asset = workOrder.ppm_schedules?.assets
  const site = asset?.buildings?.sites
  const checklist = (workOrder.checklist_items ?? []).sort(
    (a, b) => a.sort_order - b.sort_order
  )

  const joined = wo as Record<string, unknown>
  const report = rowsOf(joined.work_order_reports as Partial<WorkOrderReport> | Partial<WorkOrderReport>[] | null)[0] ?? null
  // Each revision adds an estimate row: always work from the newest one
  const costingRows = rowsOf(joined.work_order_costings as Partial<WorkOrderCosting> | Partial<WorkOrderCosting>[] | null)
  const costing = latestCosting(costingRows)
  const evidence = rowsOf(joined.work_order_completion_evidence as Partial<WorkOrderCompletionEvidence> | Partial<WorkOrderCompletionEvidence>[] | null)[0] ?? null
  const companyName = rowsOf(joined.tenant_companies as { name: string } | { name: string }[] | null)[0]?.name ?? null
  const floorLabel = rowsOf(joined.floors as { label: string } | { label: string }[] | null)[0]?.label ?? null
  const engineers = (engineersList ?? []) as unknown as Engineer[]
  const comments = (rawComments ?? []) as WoComment[]
  const mentionables: MentionableEngineer[] = (engineersList ?? []).map((e) => ({
    id: e.id,
    full_name: (e as { id: string; full_name: string }).full_name,
  }))
  const people = Object.fromEntries(engineers.map((engineer) => [engineer.id, engineer.full_name]))

  const view = buildWorkflowSteps({
    workOrder,
    report,
    costing,
    costingCount: costingRows.length,
    evidence,
    approvalTrail: (trailData ?? []) as WorkflowInput['approvalTrail'],
    events: (eventRows ?? []) as WorkflowInput['events'],
    people,
    companyName,
    floorLabel,
  })

  // Read-only context shown in the Assign Work Order modal, sourced from the originating tenant report + approved cost
  const assignJobSummary = {
    location: [asset?.name, floorLabel, report?.location_notes, site?.name].filter(Boolean).join(' — ') || null,
    requestedBy: companyName || report?.tenant_lessee || report?.reported_by_name || null,
    reportedIssue: report?.fault_description ?? null,
    approvedCost: workOrder.costing_approved_by_name && costing?.grand_total != null ? Number(costing.grand_total) : null,
  }

  // Access was checked above, so captured signature images can be shown
  const formData = withFileRouteUrls(await loadWorkOrderForm(service, id, { includeSignatures: true }))

  const subtitle = [
    TYPE_LABEL[workOrder.type] ?? workOrder.type,
    workOrder.priority ? `${priorityLabel(workOrder.priority)} priority` : 'Priority not assessed',
    [report?.fault_description ? shorten(report.fault_description) : workOrder.ppm_schedules?.title, floorLabel].filter(Boolean).join(', '),
  ].filter(Boolean).join(' · ')

  const detailRows: DetailRow[] = [
    { label: 'Asset', value: asset?.name },
    { label: 'Site', value: site?.name ?? slugProperty.name },
    { label: 'Location', value: [floorLabel, report?.location_notes].filter(Boolean).join(', ') || asset?.location },
    { label: 'Company', value: companyName },
    { label: 'Contact', value: report?.reported_by_name ?? workOrder.tenant_name, hint: report?.reported_by_contact },
    { label: 'Engineer', value: workOrder.engineers?.full_name },
    { label: 'Contractor', value: workOrder.execution_mode === 'third_party' ? workOrder.contractor_name : null },
    { label: 'Scheduled', value: workOrder.scheduled_date ? formatPHT(workOrder.scheduled_date) : null },
    { label: 'Due', value: workOrder.due_date ? formatPHT(workOrder.due_date) : null },
  ]

  const cost: DetailsCost = {
    total: costing?.grand_total != null ? Number(costing.grand_total) : null,
    isWaived: workOrder.is_cost_waived,
    waivedBy: workOrder.cost_waived_by_name,
    note: workOrder.costing_approved_at
      ? 'Approved by the tenant'
      : workOrder.status === 'pending_approval'
        ? 'Awaiting tenant approval'
        : null,
  }

  const hasActions = workOrder.status !== 'completed' && workOrder.status !== 'cancelled'

  return (
    <div className="mx-auto w-full max-w-[72rem] space-y-6">
      <WorkOrderHeader
        slug={slug}
        woNumber={workOrder.wo_number}
        status={workOrder.status}
        isCostWaived={workOrder.is_cost_waived}
        subtitle={subtitle}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,47rem)_20rem] xl:justify-center">
        <div className="min-w-0">
          <WorkflowSteps
            view={view}
            actions={hasActions ? (
              <WorkOrderActions
                key={`${workOrder.status}:${workOrder.execution_mode}`}
                workOrder={workOrder}
                engineers={engineers}
                slug={slug}
                permissions={permissions}
                jobSummary={assignJobSummary}
                existingCosting={costing ? {
                  labour_hours: Number(costing.labour_hours ?? 0),
                  labour_rate: Number(costing.labour_rate ?? 0),
                  materials_total: Number(costing.materials_total ?? 0),
                  subcontractor_total: Number(costing.subcontractor_total ?? 0),
                  line_items: normalizeLineItems(costing.line_items),
                  notes: costing.notes ?? null,
                } : null}
                existingEvidence={evidence ? {
                  work_description: evidence.work_description ?? '',
                  completion_photo_urls: evidence.completion_photo_urls ?? [],
                  supporting_doc_urls: evidence.supporting_doc_urls ?? [],
                } : null}
              />
            ) : undefined}
          />
        </div>

        <aside className="min-w-0 xl:sticky xl:top-6 xl:row-span-2 xl:self-start" aria-label="Work order details">
          <WorkOrderDetailsCard rows={detailRows} cost={cost}>
            {formData && (
              <ServiceReportFormDialog woNumber={workOrder.wo_number} pdfHref={`/api/pdf/${workOrder.id}/report`}>
                <WorkOrderFormSheet data={formData} />
              </ServiceReportFormDialog>
            )}
          </WorkOrderDetailsCard>
        </aside>

        <div className="min-w-0 space-y-6">
          {checklist.length > 0 && (
            <section aria-labelledby="work-order-checklist-title" className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 id="work-order-checklist-title" className="text-sm font-semibold text-gray-900">
                Checklist <span className="font-normal text-gray-500">({checklist.length} items)</span>
              </h2>
              <div className="mt-2">
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
            </section>
          )}

          <WoCommentsSection workOrderId={workOrder.id} initialComments={comments} mentionables={mentionables} canComment={canComment} />
        </div>
      </div>
    </div>
  )
}
