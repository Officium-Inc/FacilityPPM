import type {
  ApprovalTrailEntry,
  WorkOrder,
  WorkOrderCompletionEvidence,
  WorkOrderCosting,
  WorkOrderEvent,
  WorkOrderReport,
  WorkOrderStatus,
} from '@/types'
import { formatPeso, formatQtyUnit, lineItemTotal, normalizeLineItems, providedByLabel } from '@/lib/costing'
import { priorityLabel } from '@/lib/priority'
import { formatPHT, formatPHTDateTime } from '@/lib/utils'
import { SEND_BACK_EVENT_TYPE } from '@/lib/verification-rules'

/**
 * The work order workflow as a list of steps for the detail page timeline: which step the order is at,
 * and for each completed step a summary, who did it and when, and its details. Pure (no database, no
 * class names) so it can be unit tested; the page loads the rows and passes them in.
 *
 * Sources, newest first: logged events (`work_order_events`), then `approval_trail`, then the columns that
 * older orders still rely on. Rework loops (estimate rejected, work sent back, sign-off rejected) show the
 * latest outcome on the step; earlier rounds are counted in its details.
 */

export type WorkflowStepKey =
  | 'service_report'
  | 'inspection'
  | 'costing'
  | 'cost_approval'
  | 'assignment'
  | 'work_execution'
  | 'final_verification'
  | 'tenant_sign_off'
  | 'completed'
  | 'scheduled'

/** Reactive requests start from a service report; PPM and corrective orders start from a schedule. */
export type WorkflowVariant = 'reactive' | 'ppm'

export type StepState = 'done' | 'current' | 'upcoming' | 'cancelled'

export interface StepField {
  label: string
  value: string
  /** Long text that spans both columns. */
  wide?: boolean
}

export interface StepFile {
  kind: 'image' | 'document'
  label: string
  url: string
}

export interface StepLineItem {
  description: string
  qtyUnit: string
  unitCost: string
  total: string
  providedBy: string
  /** Supplied by the tenant: listed but not charged. */
  excluded: boolean
}

export interface StepNotice {
  tone: 'warning' | 'danger'
  title: string
  reason: string | null
  actorLine: string | null
}

export interface WorkflowStep {
  key: WorkflowStepKey
  number: number
  label: string
  description: string
  state: StepState
  summary: string | null
  at: string | null
  /** `at` in Philippine Time, e.g. "02 Jun 2026, 9:14 AM". */
  atLabel: string | null
  /** "JJ Cruz · 08 Jun 2026, 5:12 PM" */
  actorLine: string | null
  fields: StepField[]
  files: StepFile[]
  lineItems: StepLineItem[]
  tag: string | null
  hasDetails: boolean
}

export interface WorkflowView {
  variant: WorkflowVariant
  steps: WorkflowStep[]
  /** null once the work order is completed. */
  currentIndex: number | null
  /** The step shown inside the current step's card: the last completed one (or the current step itself at the start). */
  previousStep: WorkflowStep | null
  /** Why the work came back to the current step, or why the order was cancelled. */
  notice: StepNotice | null
}

type EventRow = Pick<WorkOrderEvent, 'event_type' | 'actor_name' | 'actor_role' | 'decision' | 'reason' | 'metadata' | 'created_at'>
type TrailRow = Pick<ApprovalTrailEntry, 'stage' | 'actor_name' | 'decision' | 'reason' | 'created_at'>

export type WorkflowWorkOrder = Pick<
  WorkOrder,
  | 'id' | 'wo_number' | 'status' | 'priority' | 'created_at' | 'updated_at' | 'requested_by_id'
  | 'due_date' | 'assignment_instructions' | 'execution_mode' | 'contractor_name' | 'contractor_contact' | 'contractor_notes'
  | 'head_engineer_id' | 'head_engineer_verified_at' | 'head_engineer_notes'
  | 'costing_approved_at' | 'costing_approved_by_name' | 'rejection_reason' | 'hours_logged'
  | 'signed_at' | 'signed_by_name' | 'rating' | 'rating_comment' | 'pdf_url' | 'audit_report_url'
  | 'is_cost_waived' | 'cost_waived_at' | 'cost_waived_by_name' | 'cost_waived_reason'
  | 'cancelled_at' | 'cancelled_by_name' | 'cancellation_reason' | 'cancelled_stage'
  | 'original_wo_number' | 'scheduled_date' | 'completed_date' | 'notes' | 'tenant_name' | 'tenant_email'
> & {
  engineers?: { full_name?: string | null } | null
  ppm_schedules?: {
    title?: string | null
    frequency?: string | null
    assets?: { name?: string | null; category?: string | null; make?: string | null; model?: string | null } | null
  } | null
}

export interface WorkflowInput {
  workOrder: WorkflowWorkOrder
  report: Partial<WorkOrderReport> | null
  /** The latest estimate (see `latestCosting`). */
  costing: Partial<WorkOrderCosting> | null
  /** How many estimates were prepared (each revision adds one). */
  costingCount: number
  evidence: Partial<WorkOrderCompletionEvidence> | null
  approvalTrail: TrailRow[]
  events: EventRow[]
  /** Member id → full name, for older rows that only stored an id. */
  people: Record<string, string>
  companyName: string | null
  floorLabel: string | null
}

const STEP_TEXT: Record<WorkflowStepKey, { label: string; current: string; upcoming: string }> = {
  service_report: { label: 'Service Report', current: 'Review the report and assign an inspection team', upcoming: 'Tenant reports the issue' },
  inspection: { label: 'Inspection', current: 'Inspect the issue and record the findings', upcoming: 'Engineer inspects the issue' },
  costing: { label: 'Costing', current: 'Prepare the cost estimate for the tenant', upcoming: 'Cost estimate is prepared' },
  cost_approval: { label: 'Cost Approval', current: 'Tenant reviews the cost estimate', upcoming: 'Tenant approves the cost' },
  assignment: { label: 'Assignment', current: 'Assign the work to a service team member', upcoming: 'Work is assigned to an engineer' },
  work_execution: { label: 'Work Execution', current: 'Carry out the work and submit the completion evidence', upcoming: 'Work is carried out' },
  final_verification: { label: 'Final Verification', current: 'Head engineer verifies the work', upcoming: 'Head engineer verifies the work' },
  tenant_sign_off: { label: 'Tenant Sign-Off', current: 'Tenant confirms the issue is fixed', upcoming: 'Tenant confirms the issue is fixed' },
  completed: { label: 'Completed', current: 'Work order is closed', upcoming: 'Work order is closed' },
  scheduled: { label: 'Scheduled', current: 'Start the scheduled maintenance', upcoming: 'Maintenance is scheduled' },
}

export const WORKFLOW_STEPS: Record<WorkflowVariant, WorkflowStepKey[]> = {
  reactive: ['service_report', 'inspection', 'costing', 'cost_approval', 'assignment', 'work_execution', 'final_verification', 'tenant_sign_off', 'completed'],
  ppm: ['scheduled', 'work_execution', 'final_verification', 'tenant_sign_off', 'completed'],
}

const STATUS_STEP: Record<WorkflowVariant, Partial<Record<WorkOrderStatus, WorkflowStepKey>>> = {
  reactive: {
    new_report: 'service_report',
    inspecting: 'inspection',
    costing: 'costing',
    pending_approval: 'cost_approval',
    assigned: 'assignment',
    scheduled: 'assignment',
    overdue: 'assignment',
    in_progress: 'work_execution',
    on_hold: 'work_execution',
    svc_submitted: 'final_verification',
    signed: 'final_verification', // legacy: the tenant signed before verification
    verified: 'tenant_sign_off',
    completed: 'completed',
  },
  ppm: {
    scheduled: 'scheduled',
    overdue: 'scheduled',
    in_progress: 'work_execution',
    on_hold: 'work_execution',
    svc_submitted: 'final_verification',
    signed: 'final_verification',
    verified: 'tenant_sign_off',
    completed: 'completed',
  },
}

const REACTIVE_ONLY_STATUSES: WorkOrderStatus[] = ['new_report', 'inspecting', 'costing', 'pending_approval', 'assigned']

const STATUS_TAG: Partial<Record<WorkOrderStatus, string>> = {
  on_hold: 'On hold',
  overdue: 'Overdue',
  signed: 'Tenant signed before verification (previous flow)',
}

export function workflowVariant(status: WorkOrderStatus, hasReport: boolean): WorkflowVariant {
  return hasReport || REACTIVE_ONLY_STATUSES.includes(status) ? 'reactive' : 'ppm'
}

/** The step a work order in `status` is at; undefined for cancelled orders. */
export function stepForStatus(variant: WorkflowVariant, status: WorkOrderStatus): WorkflowStepKey | undefined {
  return STATUS_STEP[variant][status]
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function timeOf(value: string | null | undefined) {
  const time = value ? Date.parse(value) : NaN
  return Number.isNaN(time) ? -Infinity : time
}

function text(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function meta(event: EventRow | null | undefined, key: string): unknown {
  const metadata = event?.metadata
  return metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>)[key] : undefined
}

function eventsOf(events: EventRow[], type: string) {
  return events.filter((event) => event.event_type === type)
}

function newest<T>(rows: T[], at: (row: T) => string | null | undefined): T | null {
  let found: T | null = null
  for (const row of rows) if (!found || timeOf(at(row)) >= timeOf(at(found))) found = row
  return found
}

function latestEvent(events: EventRow[], type: string) {
  return newest(eventsOf(events, type), (event) => event.created_at)
}

function trailOf(trail: TrailRow[], stage: TrailRow['stage'], decision: TrailRow['decision']) {
  return trail.filter((row) => row.stage === stage && row.decision === decision)
}

function field(label: string, value: unknown, wide = false): StepField | null {
  const clean = text(value)
  return clean ? { label, value: clean, ...(wide ? { wide } : {}) } : null
}

function present<T>(items: Array<T | null | undefined | false>): T[] {
  return items.filter((item): item is T => Boolean(item))
}

function urls(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((url): url is string => typeof url === 'string' && url.length > 0) : []
}

function filesFrom(value: unknown, kind: StepFile['kind'], label: string): StepFile[] {
  const list = urls(value)
  return list.map((url, index) => ({ kind, url, label: list.length > 1 ? `${label} ${index + 1}` : label }))
}

function actorLine(name: string | null | undefined, at: string | null | undefined) {
  const parts = present([text(name), at ? formatPHTDateTime(at) : null])
  return parts.length > 0 ? parts.join(' · ') : null
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function viaLabel(event: EventRow | null) {
  const via = meta(event, 'via')
  return via === 'portal' ? 'Tenant portal' : via === 'link' ? 'Emailed link' : null
}

interface StepData {
  summary: string | null
  at: string | null
  actor: string | null
  fields: StepField[]
  files: StepFile[]
  lineItems?: StepLineItem[]
}

// ── Step data ───────────────────────────────────────────────────────────────

function serviceReportData({ workOrder: wo, report, events, companyName, floorLabel }: WorkflowInput): StepData {
  const submitted = eventsOf(events, 'report_submitted')[0] ?? null
  const byTenant = submitted ? submitted.actor_role === 'tenant' : Boolean(wo.requested_by_id)
  const name = text(submitted?.actor_name) ?? text(report?.reported_by_name) ?? text(wo.tenant_name)
  const lessee = text(report?.tenant_lessee)
  return {
    summary: text(report?.fault_description),
    at: submitted?.created_at ?? report?.created_at ?? wo.created_at,
    actor: name ? `${name}${byTenant ? ' (tenant contact)' : ''}` : null,
    fields: present([
      field('Description', report?.fault_description),
      field('Location', present([floorLabel, text(report?.location_notes)]).join(', ')),
      field('Company', companyName),
      lessee && lessee !== companyName ? field('Tenant / lessee', lessee) : null,
      field('Contact person', report?.reported_by_name),
      field('Contact details', report?.reported_by_contact),
      field('Priority', report?.urgency || wo.priority ? priorityLabel(report?.urgency ?? wo.priority) : null),
    ]),
    files: filesFrom(report?.photo_urls, 'image', 'Service report photo'),
  }
}

function inspectionData({ workOrder: wo, report, events, people }: WorkflowInput): StepData {
  const completed = latestEvent(events, 'inspection_completed')
  const assigned = latestEvent(events, 'inspection_assigned')
  const notes = text(report?.inspection_notes)
  const rootCause = text(report?.root_cause)
  const thirdParty = wo.execution_mode === 'third_party'
  return {
    summary: present([notes, rootCause ? `root cause: ${rootCause}` : null]).join(' · ') || null,
    at: completed?.created_at ?? report?.inspected_at ?? null,
    actor: text(completed?.actor_name) ?? (report?.inspected_by_id ? people[report.inspected_by_id] ?? null : null),
    fields: present([
      field('Notes', notes),
      field('Root cause', rootCause),
      field('Scope of work', report?.scope_of_work, true),
      field('Priority', wo.priority ? priorityLabel(wo.priority) : null),
      field('Inspected by', meta(assigned, 'assignee_name')),
      thirdParty ? field('Work by', `Third-party contractor${wo.contractor_name ? `: ${wo.contractor_name}` : ''}`) : null,
      thirdParty ? field('Contractor contact', wo.contractor_contact) : null,
      thirdParty ? field('Contractor notes', wo.contractor_notes, true) : null,
    ]),
    files: filesFrom(report?.inspection_photo_urls, 'image', 'Inspection photo'),
  }
}

function costingData({ workOrder: wo, costing, costingCount, events, people }: WorkflowInput): StepData {
  if (!costing) return { summary: null, at: null, actor: null, fields: [], files: [] }
  const submitted = latestEvent(events, 'costing_submitted')
  const hours = Number(costing.labour_hours ?? 0)
  const rate = Number(costing.labour_rate ?? 0)
  const labourTotal = costing.labour_total != null ? Number(costing.labour_total) : hours * rate
  const materials = Number(costing.materials_total ?? 0)
  const subcontractor = Number(costing.subcontractor_total ?? 0)
  return {
    summary: `${formatPeso(costing.grand_total)} estimated${costingCount > 1 ? ` · revision ${costingCount}` : ''}`,
    at: submitted?.created_at ?? costing.submitted_at ?? null,
    actor: text(submitted?.actor_name) ?? (costing.submitted_by_id ? people[costing.submitted_by_id] ?? null : null),
    fields: present([
      hours > 0 || rate > 0 ? field('Labour', `${hours}h × ${formatPeso(rate)}/h = ${formatPeso(labourTotal)}`) : null,
      materials > 0 ? field('Materials', formatPeso(materials)) : null,
      subcontractor > 0 ? field('Subcontractor', formatPeso(subcontractor)) : null,
      field('Total', formatPeso(costing.grand_total)),
      field('Sent to', meta(submitted, 'tenant_email')),
      field('Notes', costing.notes, true),
    ]),
    files: [{ kind: 'document', label: 'Cost estimate (PDF)', url: `/api/pdf/${wo.id}/costing` }],
    lineItems: normalizeLineItems(costing.line_items).map((item) => ({
      description: item.description,
      qtyUnit: formatQtyUnit(item),
      unitCost: formatPeso(item.unit_cost),
      total: formatPeso(lineItemTotal(item)),
      providedBy: providedByLabel(item.provided_by),
      excluded: item.provided_by === 'tenant',
    })),
  }
}

/** Rejections of the cost estimate, newest last (events when logged, else the approval trail). */
function costRejections({ events, approvalTrail }: WorkflowInput) {
  const logged = eventsOf(events, 'costing_rejected').map((event) => ({ name: event.actor_name, reason: event.reason, at: event.created_at }))
  if (logged.length > 0) return logged
  return trailOf(approvalTrail, 'costing_approval', 'rejected').map((row) => ({ name: row.actor_name, reason: row.reason, at: row.created_at }))
}

/** Final verification send-backs (D28), newest last. */
function sendBacks({ events, approvalTrail }: WorkflowInput) {
  const logged = eventsOf(events, SEND_BACK_EVENT_TYPE).map((event) => ({ name: event.actor_name, reason: event.reason, at: event.created_at }))
  if (logged.length > 0) return logged
  return trailOf(approvalTrail, 'final_verification', 'rejected').map((row) => ({ name: row.actor_name, reason: row.reason, at: row.created_at }))
}

function earlierRounds(rounds: Array<{ reason: string | null }>, word: string) {
  if (rounds.length === 0) return null
  const last = text(rounds[rounds.length - 1].reason)
  return `${plural(rounds.length, word)}${last ? ` · last: “${last}”` : ''}`
}

function costApprovalData(input: WorkflowInput): StepData {
  const { workOrder: wo, events, approvalTrail } = input
  const approvedEvent = latestEvent(events, 'costing_approved')
  const approvedTrail = newest(trailOf(approvalTrail, 'costing_approval', 'approved'), (row) => row.created_at)
  const at = approvedEvent?.created_at ?? approvedTrail?.created_at ?? wo.costing_approved_at
  const rejections = costRejections(input)
  if (!at) return { summary: null, at: null, actor: null, fields: [], files: [] }
  const waiverReason = text(wo.cost_waived_reason)
  return {
    summary: present([
      'Approved',
      wo.is_cost_waived ? 'cost waived' : null,
      rejections.length > 0 ? `after ${plural(rejections.length, 'rejection')}` : null,
    ]).join(' · '),
    at,
    actor: text(approvedEvent?.actor_name) ?? text(approvedTrail?.actor_name) ?? text(wo.costing_approved_by_name),
    fields: present([
      field('Decision', 'Approved'),
      field('Billing', wo.is_cost_waived ? `Cost waived${waiverReason ? ` — ${waiverReason}` : ''}` : 'Charged as estimated'),
      wo.is_cost_waived ? field('Waived by', present([text(wo.cost_waived_by_name), wo.cost_waived_at ? formatPHT(wo.cost_waived_at) : null]).join(' · ')) : null,
      field('Via', viaLabel(approvedEvent)),
      field('Earlier rejections', earlierRounds(rejections, 'rejection'), true),
    ]),
    files: [],
  }
}

function assignmentData({ workOrder: wo, events }: WorkflowInput): StepData {
  const assigned = latestEvent(events, 'assigned')
  const assignee = text(meta(assigned, 'assignee_name')) ?? text(wo.engineers?.full_name)
  const thirdParty = wo.execution_mode === 'third_party'
  return {
    summary: assignee ? `Assigned to ${assignee}` : null,
    at: assigned?.created_at ?? null,
    actor: text(assigned?.actor_name),
    fields: present([
      field('Engineer', assignee),
      field('Due', wo.due_date ? formatPHT(wo.due_date) : null),
      field('Priority', wo.priority ? priorityLabel(wo.priority) : null),
      thirdParty ? field('Contractor', wo.contractor_name) : null,
      field('Report number', wo.original_wo_number),
      field('Instructions', wo.assignment_instructions, true),
    ]),
    files: [],
  }
}

function workExecutionData({ workOrder: wo, evidence, events, people }: WorkflowInput): StepData {
  const submissions = eventsOf(events, 'work_submitted')
  const submitted = newest(submissions, (event) => event.created_at)
  const loggedHours = meta(submitted, 'hours_logged')
  const hours = wo.hours_logged ?? (typeof loggedHours === 'number' ? loggedHours : null)
  if (!evidence && !submitted) return { summary: null, at: null, actor: null, fields: [], files: [] }
  return {
    summary: `Work submitted${hours != null ? `, ${hours}h logged` : ''}`,
    at: submitted?.created_at ?? evidence?.submitted_at ?? null,
    actor: text(submitted?.actor_name)
      ?? (evidence?.submitted_by_id ? people[evidence.submitted_by_id] ?? null : null)
      ?? text(wo.engineers?.full_name),
    fields: present([
      field('Work done', evidence?.work_description ?? submitted?.reason),
      field('Hours logged', hours != null ? `${hours}h` : null),
      submissions.length > 1 ? field('Submissions', String(submissions.length)) : null,
    ]),
    files: [
      ...filesFrom(evidence?.completion_photo_urls, 'image', 'Completion photo'),
      ...filesFrom(evidence?.supporting_doc_urls, 'document', 'Supporting document'),
    ],
  }
}

function finalVerificationData(input: WorkflowInput): StepData {
  const { workOrder: wo, events, approvalTrail, people } = input
  const approvedEvent = latestEvent(events, 'final_verified')
  const approvedTrail = newest(trailOf(approvalTrail, 'final_verification', 'approved'), (row) => row.created_at)
  const at = approvedEvent?.created_at ?? approvedTrail?.created_at ?? wo.head_engineer_verified_at
  if (!at) return { summary: null, at: null, actor: null, fields: [], files: [] }
  const tenant = text(wo.tenant_name)
  const email = text(wo.tenant_email)
  return {
    summary: 'Approved',
    at,
    actor: text(approvedEvent?.actor_name)
      ?? text(approvedTrail?.actor_name)
      ?? (wo.head_engineer_id ? people[wo.head_engineer_id] ?? null : null),
    fields: present([
      field('Decision', 'Approved'),
      field('Sign-off sent to', tenant && email && tenant !== email ? `${tenant} (${email})` : email ?? tenant),
      field('Notes', wo.head_engineer_notes ?? approvedTrail?.reason, true),
      field('Earlier send-backs', earlierRounds(sendBacks(input), 'send-back'), true),
    ]),
    files: [],
  }
}

function tenantSignOffData({ workOrder: wo, events }: WorkflowInput): StepData {
  const signed = latestEvent(events, 'tenant_signed')
  const rejections = eventsOf(events, 'tenant_rejected')
  const at = wo.signed_at ?? signed?.created_at ?? null
  if (!at) return { summary: null, at: null, actor: null, fields: [], files: [] }
  const signer = text(wo.signed_by_name) ?? text(signed?.actor_name)
  const rating = typeof wo.rating === 'number' && wo.rating >= 1 && wo.rating <= 5 ? wo.rating : null
  return {
    summary: present([signer ? `Signed by ${signer}` : 'Signed', rating ? `rated ${rating}/5` : null]).join(' · '),
    at,
    actor: signer,
    fields: present([
      field('Signed by', signer),
      field('Rating', rating ? `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)} ${rating}/5` : null),
      field('Via', viaLabel(signed)),
      field('Comment', wo.rating_comment, true),
      field('Earlier rejections', earlierRounds(rejections, 'rejection'), true),
    ]),
    files: [{ kind: 'document', label: 'Signed receipt (PDF)', url: wo.pdf_url ?? `/api/pdf/${wo.id}` }],
  }
}

function completedData({ workOrder: wo }: WorkflowInput): StepData {
  const closedAt = wo.completed_date
    ?? newest(present([wo.signed_at, wo.head_engineer_verified_at]), (value) => value)
    ?? wo.updated_at
  return {
    summary: 'Work order closed',
    at: closedAt,
    actor: null,
    fields: [],
    files: [{ kind: 'document', label: 'Audit report (PDF)', url: wo.audit_report_url ?? `/api/pdf/${wo.id}/audit` }],
  }
}

function scheduledData({ workOrder: wo, events }: WorkflowInput): StepData {
  const started = newest(
    eventsOf(events, 'status_changed').filter((event) => ['scheduled', 'overdue'].includes(String(meta(event, 'from')))),
    (event) => event.created_at
  )
  const schedule = wo.ppm_schedules
  const asset = schedule?.assets
  return {
    summary: present([text(schedule?.title) ?? 'Scheduled maintenance', wo.scheduled_date ? formatPHT(wo.scheduled_date) : null]).join(' · '),
    at: started?.created_at ?? null,
    actor: text(started?.actor_name),
    fields: present([
      field('Schedule', present([text(schedule?.title), text(schedule?.frequency)]).join(' · ')),
      field('Scheduled date', wo.scheduled_date ? formatPHT(wo.scheduled_date) : null),
      field('Asset', asset?.name),
      field('Category', asset?.category),
      field('Make / model', present([text(asset?.make), text(asset?.model)]).join(' ')),
      field('Notes', wo.notes, true),
    ]),
    files: [],
  }
}

const STEP_DATA: Record<WorkflowStepKey, (input: WorkflowInput) => StepData> = {
  service_report: serviceReportData,
  inspection: inspectionData,
  costing: costingData,
  cost_approval: costApprovalData,
  assignment: assignmentData,
  work_execution: workExecutionData,
  final_verification: finalVerificationData,
  tenant_sign_off: tenantSignOffData,
  completed: completedData,
  scheduled: scheduledData,
}

// ── Current step, cancellation and notices ──────────────────────────────────

function cancelledIndex(input: WorkflowInput, keys: WorkflowStepKey[]) {
  const { workOrder: wo, events, costing } = input
  const indexOf = (key: WorkflowStepKey) => Math.max(0, keys.indexOf(key))
  if (wo.cancelled_stage === 'inspection') return indexOf('inspection')
  if (wo.cancelled_stage !== 'costing') return 0
  // Cancelled while the estimate was with the tenant, or while it was being prepared (again)?
  const sent = latestEvent(events, 'costing_submitted')?.created_at ?? costing?.submitted_at ?? null
  const rejected = costRejections(input).at(-1)?.at ?? null
  return sent && timeOf(sent) > timeOf(rejected) ? indexOf('cost_approval') : indexOf('costing')
}

function cancellationNotice(wo: WorkflowWorkOrder): StepNotice {
  return {
    tone: 'danger',
    title: wo.cancelled_stage === 'submission' ? 'Withdrawn by the tenant' : 'Request cancelled',
    reason: text(wo.cancellation_reason),
    actorLine: actorLine(wo.cancelled_by_name, wo.cancelled_at),
  }
}

/** Why the work is back at the current step, if it came back since it was last submitted from there. */
function returnNotice(input: WorkflowInput, key: WorkflowStepKey): StepNotice | null {
  const { workOrder: wo, events, costing, evidence } = input

  if (key === 'costing') {
    const rejection = costRejections(input).at(-1)
    const sent = latestEvent(events, 'costing_submitted')?.created_at ?? costing?.submitted_at ?? null
    if (rejection && timeOf(rejection.at) > timeOf(sent)) {
      return { tone: 'warning', title: 'The tenant rejected the estimate', reason: text(rejection.reason), actorLine: actorLine(rejection.name, rejection.at) }
    }
    // Older orders only kept the reason on the work order
    if (!rejection && wo.status === 'costing' && text(wo.rejection_reason)) {
      return { tone: 'warning', title: 'The tenant rejected the estimate', reason: text(wo.rejection_reason), actorLine: null }
    }
    return null
  }

  if (key === 'work_execution') {
    const submitted = latestEvent(events, 'work_submitted')?.created_at ?? evidence?.submitted_at ?? null
    const sentBack = sendBacks(input).at(-1)
    const tenantRejected = latestEvent(events, 'tenant_rejected')
    const latest = timeOf(sentBack?.at) >= timeOf(tenantRejected?.created_at) ? 'sent_back' : 'tenant'
    if (latest === 'sent_back' && sentBack && timeOf(sentBack.at) > timeOf(submitted)) {
      return { tone: 'warning', title: 'Sent back from Final Verification', reason: text(sentBack.reason), actorLine: actorLine(sentBack.name, sentBack.at) }
    }
    if (latest === 'tenant' && tenantRejected && timeOf(tenantRejected.created_at) > timeOf(submitted)) {
      const reason = text(tenantRejected.reason)
      return {
        tone: 'danger',
        title: 'The tenant rejected the sign-off',
        reason: `${reason ? `${reason} ` : ''}A corrective work order WO-CORR-${wo.wo_number} was raised.`,
        actorLine: actorLine(tenantRejected.actor_name, tenantRejected.created_at),
      }
    }
  }

  return null
}

// ── Builder ─────────────────────────────────────────────────────────────────

export function buildWorkflowSteps(input: WorkflowInput): WorkflowView {
  const { workOrder: wo } = input
  const variant = workflowVariant(wo.status, Boolean(input.report))
  const keys = WORKFLOW_STEPS[variant]
  const isCancelled = wo.status === 'cancelled'
  const isCompleted = wo.status === 'completed'
  const currentKey = stepForStatus(variant, wo.status)
  const currentIndex = isCompleted
    ? null
    : isCancelled
      ? cancelledIndex(input, keys)
      : Math.max(0, keys.indexOf(currentKey ?? keys[0]))
  const legacySigned = wo.status === 'signed'

  const steps: WorkflowStep[] = keys.map((key, index) => {
    const copy = STEP_TEXT[key]
    const isCurrent = index === currentIndex
    // Legacy `signed`: the tenant signed before the head engineer verified, so sign-off is already done
    const done = currentIndex === null || index < currentIndex || (legacySigned && key === 'tenant_sign_off')
    const state: StepState = done ? 'done' : isCurrent ? (isCancelled ? 'cancelled' : 'current') : 'upcoming'
    const base = {
      key,
      number: index + 1,
      label: copy.label,
      tag: isCurrent ? STATUS_TAG[wo.status] ?? null : null,
    }

    if (state === 'upcoming') {
      return {
        ...base,
        description: isCancelled ? 'Not reached' : copy.upcoming,
        state,
        summary: null, at: null, atLabel: null, actorLine: null,
        fields: [], files: [], lineItems: [], hasDetails: false,
      }
    }

    const data = STEP_DATA[key](input)
    const lineItems = data.lineItems ?? []
    const recorded = Boolean(data.summary || data.at || data.fields.length > 0)
    return {
      ...base,
      description: state === 'cancelled' ? 'Request cancelled' : copy.current,
      state,
      summary: data.summary ?? (state === 'done' && !recorded ? 'No details recorded' : null),
      at: data.at,
      atLabel: data.at ? formatPHTDateTime(data.at) : null,
      actorLine: actorLine(data.actor, data.at),
      fields: data.fields,
      files: data.files,
      lineItems,
      hasDetails: data.fields.length > 0 || data.files.length > 0 || lineItems.length > 0,
    }
  })

  let previousStep: WorkflowStep | null = null
  if (currentIndex !== null) {
    const before = legacySigned
      ? steps.find((step) => step.key === 'tenant_sign_off')
      : [...steps.slice(0, currentIndex)].reverse().find((step) => step.state === 'done')
    // At the first step there is nothing before it: show the step's own details (e.g. the tenant's report)
    previousStep = before ?? (steps[currentIndex].hasDetails ? steps[currentIndex] : null)
  }

  const notice = currentIndex === null
    ? null
    : isCancelled
      ? cancellationNotice(wo)
      : returnNotice(input, keys[currentIndex])

  return { variant, steps, currentIndex, previousStep, notice }
}
