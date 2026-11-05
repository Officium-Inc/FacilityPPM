import { formatPHT } from '@/lib/utils'
import type { WorkOrderStatus } from '@/types'

/**
 * The tenant's view of a service report's progress: six plain-language steps (the internal costing,
 * assignment and verification steps are folded in) and a one-line "what happens next". Pure, so it can be
 * unit tested; the detail page loads the dates and passes them in. Shows only dates, statuses and the
 * assigned engineer's name, which the tenant already sees on the service report form.
 */

export type TenantStepKey = 'submitted' | 'inspection' | 'approval' | 'work' | 'sign_off' | 'completed'
export type TenantStepState = 'done' | 'current' | 'upcoming'

export interface TenantProgressStep {
  key: TenantStepKey
  label: string
  state: TenantStepState
  /** When the step finished, e.g. "20 Oct 2026"; null for current and upcoming steps or when not recorded. */
  atLabel: string | null
  /** The step is the tenant's to do (approval, sign-off). */
  yours: boolean
}

export interface TenantProgress {
  steps: TenantProgressStep[]
  /** null once the report is completed or cancelled. */
  currentIndex: number | null
  next: string | null
}

export interface TenantProgressInput {
  status: WorkOrderStatus
  /** A legacy svc_submitted order that already has a sign-off link is waiting for the tenant. */
  hasSignOffLink: boolean
  createdAt: string
  updatedAt: string
  costingApprovedAt?: string | null
  verifiedAt?: string | null
  signedAt?: string | null
  completedAt?: string | null
  dueDate?: string | null
  engineerName?: string | null
  /** `work_order_events` rows (type and time only). */
  events: Array<{ event_type: string; created_at: string }>
}

const STEPS: Array<{ key: TenantStepKey; label: string; yours?: boolean }> = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'inspection', label: 'Inspection' },
  { key: 'approval', label: 'Your approval', yours: true },
  { key: 'work', label: 'Work' },
  { key: 'sign_off', label: 'Your sign-off', yours: true },
  { key: 'completed', label: 'Completed' },
]

const STATUS_STEP: Partial<Record<WorkOrderStatus, TenantStepKey>> = {
  new_report: 'inspection',
  inspecting: 'inspection',
  costing: 'inspection',
  pending_approval: 'approval',
  assigned: 'work',
  scheduled: 'work',
  overdue: 'work',
  in_progress: 'work',
  on_hold: 'work',
  svc_submitted: 'work',
  verified: 'sign_off',
  signed: 'completed', // legacy: the tenant signed before verification; the property team closes it
}

function timeOf(value: string | null | undefined) {
  const time = value ? Date.parse(value) : NaN
  return Number.isNaN(time) ? -Infinity : time
}

function latestEvent(events: TenantProgressInput['events'], types: string[]) {
  let found: string | null = null
  for (const event of events) {
    if (types.includes(event.event_type) && timeOf(event.created_at) >= timeOf(found)) found = event.created_at
  }
  return found
}

function name(value: string | null | undefined) {
  return value?.trim() || null
}

function finishedAt(key: TenantStepKey, input: TenantProgressInput): string | null {
  const { events } = input
  switch (key) {
    case 'submitted':
      return input.createdAt
    case 'inspection':
      return latestEvent(events, ['costing_submitted']) ?? latestEvent(events, ['inspection_completed'])
    case 'approval':
      return input.costingApprovedAt ?? latestEvent(events, ['costing_approved'])
    case 'work':
      return input.verifiedAt ?? latestEvent(events, ['final_verified']) ?? latestEvent(events, ['work_submitted'])
    case 'sign_off':
      return input.signedAt ?? latestEvent(events, ['tenant_signed'])
    case 'completed':
      return input.completedAt ?? input.updatedAt
  }
}

export function tenantNextStep(input: TenantProgressInput): string | null {
  const engineer = name(input.engineerName)
  const due = input.dueDate ? formatPHT(input.dueDate) : null
  switch (input.status) {
    case 'new_report':
      return 'The property team will review your report and arrange an inspection.'
    case 'inspecting':
      return 'An engineer is inspecting the issue.'
    case 'costing':
      return 'The engineering team is preparing a cost estimate for your approval.'
    case 'pending_approval':
      return 'The cost estimate is waiting for your approval.'
    case 'assigned':
    case 'scheduled':
      return engineer
        ? `${engineer} is assigned to the work${due ? `, due ${due}` : ''}.`
        : `The work is being scheduled${due ? `, due ${due}` : ''}.`
    case 'overdue':
      return `The work is past its due date${due ? ` (${due})` : ''}.`
    case 'in_progress':
      return engineer ? `${engineer} is working on it.` : 'The work is in progress.'
    case 'on_hold':
      return 'The work is on hold for now.'
    case 'svc_submitted':
      return input.hasSignOffLink
        ? 'The work is done and waiting for your sign-off.'
        : 'The work is done. The head engineer is checking it before you sign off.'
    case 'verified':
      return 'The work is done and waiting for your sign-off.'
    case 'signed':
      return 'You signed off. The property team is closing the report.'
    case 'completed':
      return 'All done. This report is closed.'
    default:
      return null
  }
}

export function buildTenantProgress(input: TenantProgressInput): TenantProgress {
  const completed = input.status === 'completed'
  const cancelled = input.status === 'cancelled'
  const key = input.status === 'svc_submitted' && input.hasSignOffLink ? 'sign_off' : STATUS_STEP[input.status]
  const currentIndex = completed || cancelled ? null : Math.max(1, STEPS.findIndex((step) => step.key === key))

  const steps = STEPS.map((step, index): TenantProgressStep => {
    // A cancelled report only got as far as being submitted
    const done = completed || (cancelled ? index === 0 : index < (currentIndex ?? 0))
    const state: TenantStepState = done ? 'done' : index === currentIndex ? 'current' : 'upcoming'
    const at = done ? finishedAt(step.key, input) : null
    return {
      key: step.key,
      label: step.label,
      state,
      atLabel: at ? formatPHT(at) : null,
      yours: Boolean(step.yours),
    }
  })

  return { steps, currentIndex, next: tenantNextStep(input) }
}
