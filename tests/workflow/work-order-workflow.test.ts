import { describe, expect, it } from 'vitest'
import {
  buildWorkflowSteps,
  stepForStatus,
  workflowVariant,
  type WorkflowInput,
  type WorkflowWorkOrder,
} from '@/lib/work-order-workflow'

/** 2 Jun 2026 at `hour` UTC (hours past 23 roll into the next days). */
const at = (hour: number) => new Date(Date.UTC(2026, 5, 2, hour)).toISOString()

function workOrder(overrides: Partial<WorkflowWorkOrder> = {}): WorkflowWorkOrder {
  return {
    id: 'wo-1', wo_number: 'WO-1', status: 'new_report', priority: 'medium',
    created_at: at(1), updated_at: at(1), requested_by_id: 'tenant-1',
    due_date: null, assignment_instructions: null, execution_mode: 'in_house',
    contractor_name: null, contractor_contact: null, contractor_notes: null,
    head_engineer_id: null, head_engineer_verified_at: null, head_engineer_notes: null,
    costing_approved_at: null, costing_approved_by_name: null, rejection_reason: null, hours_logged: null,
    signed_at: null, signed_by_name: null, rating: null, rating_comment: null, pdf_url: null, audit_report_url: null,
    is_cost_waived: false, cost_waived_at: null, cost_waived_by_name: null, cost_waived_reason: null,
    cancelled_at: null, cancelled_by_name: null, cancellation_reason: null, cancelled_stage: null,
    original_wo_number: null, scheduled_date: null, completed_date: null, notes: null,
    tenant_name: 'JJ', tenant_email: 'jj@example.com', engineers: null, ppm_schedules: null,
    ...overrides,
  }
}

const REPORT: WorkflowInput['report'] = {
  fault_description: 'Leaks on the 15th floor',
  location_notes: null,
  reported_by_name: 'JJ',
  reported_by_contact: 'jj@example.com',
  tenant_lessee: null,
  urgency: null,
  photo_urls: ['https://example.com/photo.webp'],
  inspection_notes: '5 leaks',
  root_cause: 'Water pipe',
  scope_of_work: null,
  inspection_photo_urls: [],
  inspected_by_id: 'eng-1',
  inspected_at: at(6),
  created_at: at(1),
}

const COSTING: WorkflowInput['costing'] = {
  labour_hours: 10, labour_rate: 500, labour_total: 5000,
  materials_total: 2000, subcontractor_total: 0, grand_total: 7000,
  line_items: [], notes: null, submitted_by_id: 'eng-1', submitted_at: at(25),
}

type Event = WorkflowInput['events'][number]
const event = (event_type: string, hour: number, extra: Partial<Event> = {}): Event => ({
  event_type, actor_name: 'JJ Cruz', actor_role: 'service_group', decision: null, reason: null, metadata: {}, created_at: at(hour), ...extra,
})

function build(wo: Partial<WorkflowWorkOrder>, extra: Partial<Omit<WorkflowInput, 'workOrder'>> = {}) {
  return buildWorkflowSteps({
    report: REPORT,
    costing: null,
    costingCount: extra.costing ? 1 : 0,
    evidence: null,
    approvalTrail: [],
    events: [],
    people: {},
    companyName: null,
    floorLabel: '15th Floor',
    ...extra,
    workOrder: workOrder(wo),
  })
}

const states = (view: ReturnType<typeof build>) => view.steps.map((step) => step.state)

describe('status mapping', () => {
  it('maps every reactive status to a step', () => {
    expect(stepForStatus('reactive', 'new_report')).toBe('service_report')
    expect(stepForStatus('reactive', 'inspecting')).toBe('inspection')
    expect(stepForStatus('reactive', 'costing')).toBe('costing')
    expect(stepForStatus('reactive', 'pending_approval')).toBe('cost_approval')
    expect(stepForStatus('reactive', 'assigned')).toBe('assignment')
    expect(stepForStatus('reactive', 'in_progress')).toBe('work_execution')
    expect(stepForStatus('reactive', 'on_hold')).toBe('work_execution')
    expect(stepForStatus('reactive', 'svc_submitted')).toBe('final_verification')
    expect(stepForStatus('reactive', 'signed')).toBe('final_verification')
    expect(stepForStatus('reactive', 'verified')).toBe('tenant_sign_off')
    expect(stepForStatus('reactive', 'completed')).toBe('completed')
    expect(stepForStatus('reactive', 'cancelled')).toBeUndefined()
  })

  it('maps PPM statuses to the short flow', () => {
    expect(stepForStatus('ppm', 'scheduled')).toBe('scheduled')
    expect(stepForStatus('ppm', 'overdue')).toBe('scheduled')
    expect(stepForStatus('ppm', 'in_progress')).toBe('work_execution')
    expect(stepForStatus('ppm', 'verified')).toBe('tenant_sign_off')
  })

  it('uses the reactive flow when there is a service report or a reactive-only status', () => {
    expect(workflowVariant('scheduled', true)).toBe('reactive')
    expect(workflowVariant('scheduled', false)).toBe('ppm')
    expect(workflowVariant('new_report', false)).toBe('reactive')
  })
})

describe('buildWorkflowSteps', () => {
  it('starts at the service report and shows the report itself as context', () => {
    const view = build({ status: 'new_report' }, { events: [event('report_submitted', 1, { actor_name: 'JJ', actor_role: 'tenant' })] })
    expect(view.currentIndex).toBe(0)
    expect(states(view)).toEqual(['current', ...Array(8).fill('upcoming')])
    expect(view.previousStep?.key).toBe('service_report')
    expect(view.previousStep?.actorLine).toBe('JJ (tenant contact) · 02 Jun 2026, 9:00 AM')
    expect(view.previousStep?.fields).toContainEqual({ label: 'Location', value: '15th Floor' })
    expect(view.previousStep?.files).toEqual([{ kind: 'image', label: 'Service report photo', url: 'https://example.com/photo.webp' }])
    expect(view.notice).toBeNull()
  })

  it('keeps upcoming steps free of data', () => {
    const view = build({ status: 'new_report' })
    const inspection = view.steps[1]
    expect(inspection).toMatchObject({ state: 'upcoming', summary: null, at: null, actorLine: null, fields: [], files: [], hasDetails: false })
    expect(inspection.description).toBe('Engineer inspects the issue')
  })

  it('builds the full history at final verification', () => {
    const view = build(
      {
        status: 'svc_submitted', hours_logged: 9.5, due_date: '2026-06-11',
        costing_approved_at: at(31), costing_approved_by_name: 'Mar James Taruc',
        is_cost_waived: true, cost_waived_by_name: 'Mar James Taruc', cost_waived_at: at(31),
        cost_waived_reason: 'covered under building maintenance',
      },
      {
        costing: COSTING,
        evidence: { work_description: 'Replaced 3m of corroded supply pipe, resealed 5 joints', completion_photo_urls: [], supporting_doc_urls: [], submitted_at: at(153) },
        events: [
          event('report_submitted', 1, { actor_name: 'JJ', actor_role: 'tenant' }),
          event('inspection_completed', 6),
          event('costing_submitted', 25),
          event('costing_approved', 32, { actor_name: 'Mar James Taruc', metadata: { via: 'portal' } }),
          event('assigned', 48, { actor_name: 'Mar James Taruc', metadata: { assignee_name: 'JJ Cruz' } }),
          event('work_submitted', 153, { metadata: { hours_logged: 9.5 } }),
        ],
      }
    )

    expect(view.currentIndex).toBe(6)
    expect(states(view)).toEqual(['done', 'done', 'done', 'done', 'done', 'done', 'current', 'upcoming', 'upcoming'])
    const [report, inspection, costing, approval, assignment, execution] = view.steps
    expect(report.summary).toBe('Leaks on the 15th floor')
    expect(inspection.summary).toBe('5 leaks · root cause: Water pipe')
    expect(inspection.actorLine).toBe('JJ Cruz · 02 Jun 2026, 2:00 PM')
    expect(costing.summary).toBe('₱7,000.00 estimated')
    expect(costing.fields).toContainEqual({ label: 'Labour', value: '10h × ₱500.00/h = ₱5,000.00' })
    expect(costing.fields).toContainEqual({ label: 'Materials', value: '₱2,000.00' })
    expect(costing.fields).toContainEqual({ label: 'Total', value: '₱7,000.00' })
    expect(approval.summary).toBe('Approved · cost waived')
    expect(approval.fields).toContainEqual({ label: 'Billing', value: 'Cost waived — covered under building maintenance' })
    expect(approval.fields).toContainEqual({ label: 'Via', value: 'Tenant portal' })
    expect(assignment.summary).toBe('Assigned to JJ Cruz')
    expect(assignment.fields).toContainEqual({ label: 'Due', value: '11 Jun 2026' })
    expect(execution.summary).toBe('Work submitted, 9.5h logged')
    expect(execution.atLabel).toBe('08 Jun 2026, 5:00 PM')
    expect(view.previousStep?.key).toBe('work_execution')
    expect(view.steps[6].description).toBe('Head engineer verifies the work')
    expect(view.steps[7].description).toBe('Tenant confirms the issue is fixed')
    expect(view.notice).toBeNull()
  })

  it('falls back to columns and member names when events were not logged', () => {
    const view = build(
      { status: 'assigned', costing_approved_at: at(30), costing_approved_by_name: 'Ana Tenant' },
      { costing: COSTING, people: { 'eng-1': 'Ben Engineer' } }
    )
    expect(view.steps[1].actorLine).toBe('Ben Engineer · 02 Jun 2026, 2:00 PM')
    expect(view.steps[2].actorLine).toBe('Ben Engineer · 03 Jun 2026, 9:00 AM')
    expect(view.steps[3]).toMatchObject({ summary: 'Approved', actorLine: 'Ana Tenant · 03 Jun 2026, 2:00 PM' })
  })

  it('marks completed steps without data as having no details', () => {
    const view = build({ status: 'assigned' })
    expect(view.steps[2]).toMatchObject({ state: 'done', summary: 'No details recorded', hasDetails: false })
  })

  it('explains a rejected estimate until it is sent again', () => {
    const rejected = [event('costing_submitted', 10), event('costing_rejected', 12, { actor_name: 'Ana Tenant', reason: 'Too expensive' })]
    const back = build({ status: 'costing', rejection_reason: 'Too expensive' }, { costing: COSTING, events: rejected })
    expect(back.currentIndex).toBe(2)
    expect(back.notice).toMatchObject({ tone: 'warning', title: 'The tenant rejected the estimate', reason: 'Too expensive' })

    const resent = build({ status: 'pending_approval', rejection_reason: 'Too expensive' }, { costing: COSTING, events: [...rejected, event('costing_submitted', 14)] })
    expect(resent.notice).toBeNull()

    const approved = build(
      { status: 'assigned', rejection_reason: 'Too expensive', costing_approved_at: at(16) },
      { costing: COSTING, costingCount: 2, events: [...rejected, event('costing_submitted', 14), event('costing_approved', 16)] }
    )
    expect(approved.steps[2].summary).toBe('₱7,000.00 estimated · revision 2')
    expect(approved.steps[3].summary).toBe('Approved · after 1 rejection')
    expect(approved.steps[3].fields).toContainEqual({ label: 'Earlier rejections', value: '1 rejection · last: “Too expensive”', wide: true })
  })

  it('uses the stored rejection reason for older estimates without a log', () => {
    const view = build({ status: 'costing', rejection_reason: 'Old reason' }, { costing: COSTING })
    expect(view.notice).toMatchObject({ reason: 'Old reason', actorLine: null })
  })

  it('ignores a stale rejection reason later in the workflow', () => {
    const view = build({ status: 'in_progress', rejection_reason: 'Too expensive' }, { events: [event('costing_rejected', 12, { reason: 'Too expensive' })] })
    expect(view.notice).toBeNull()
  })

  it('explains work sent back from final verification until it is resubmitted', () => {
    const events = [
      event('work_submitted', 20),
      event('verification_sent_back', 22, { actor_name: 'Head Engineer', actor_role: 'head_engineer', reason: 'Joint still leaking' }),
    ]
    const back = build({ status: 'in_progress' }, { events })
    expect(back.currentIndex).toBe(5)
    expect(back.steps[6].state).toBe('upcoming')
    expect(back.notice).toMatchObject({ tone: 'warning', title: 'Sent back from Final Verification', reason: 'Joint still leaking' })

    const resubmitted = build({ status: 'svc_submitted' }, { events: [...events, event('work_submitted', 24)] })
    expect(resubmitted.notice).toBeNull()
    expect(resubmitted.previousStep?.key).toBe('work_execution')
    expect(resubmitted.steps[5].fields).toContainEqual({ label: 'Submissions', value: '2' })

    const verified = build(
      { status: 'verified', head_engineer_verified_at: at(26) },
      { events: [...events, event('work_submitted', 24), event('final_verified', 26, { actor_name: 'Head Engineer' })] }
    )
    expect(verified.steps[6].fields).toContainEqual({ label: 'Earlier send-backs', value: '1 send-back · last: “Joint still leaking”', wide: true })
  })

  it('reads a send-back from the approval trail when no event was logged', () => {
    const view = build(
      { status: 'in_progress' },
      { approvalTrail: [{ stage: 'final_verification', actor_name: 'Head Engineer', decision: 'rejected', reason: 'Redo', created_at: at(22) }] }
    )
    expect(view.notice).toMatchObject({ title: 'Sent back from Final Verification', reason: 'Redo' })
  })

  it('mentions the corrective work order after a tenant rejects the sign-off', () => {
    const view = build({ status: 'in_progress' }, { events: [event('work_submitted', 20), event('tenant_rejected', 30, { actor_name: 'JJ', reason: 'Still leaking' })] })
    expect(view.notice).toMatchObject({ tone: 'danger', title: 'The tenant rejected the sign-off' })
    expect(view.notice?.reason).toBe('Still leaking A corrective work order WO-CORR-WO-1 was raised.')
  })

  it('marks the step where the request was cancelled', () => {
    const withdrawn = build({ status: 'cancelled', cancelled_stage: 'submission', cancellation_reason: 'Fixed it myself', cancelled_by_name: 'JJ', cancelled_at: at(2) })
    expect(withdrawn.currentIndex).toBe(0)
    expect(withdrawn.steps[0].state).toBe('cancelled')
    expect(withdrawn.steps[1].description).toBe('Not reached')
    expect(withdrawn.notice).toMatchObject({ tone: 'danger', title: 'Withdrawn by the tenant', reason: 'Fixed it myself', actorLine: 'JJ · 02 Jun 2026, 10:00 AM' })

    expect(build({ status: 'cancelled', cancelled_stage: 'inspection' }).currentIndex).toBe(1)
    expect(build({ status: 'cancelled', cancelled_stage: 'costing' }).currentIndex).toBe(2)
    expect(build({ status: 'cancelled', cancelled_stage: 'costing' }, { costing: COSTING }).currentIndex).toBe(3)
    expect(
      build({ status: 'cancelled', cancelled_stage: 'costing' }, { costing: COSTING, events: [event('costing_submitted', 25), event('costing_rejected', 27)] }).currentIndex
    ).toBe(2)
  })

  it('shows the tenant sign-off as done for legacy orders signed before verification', () => {
    const view = build({ status: 'signed', signed_at: at(40), signed_by_name: 'JJ', rating: 4 })
    expect(view.currentIndex).toBe(6)
    expect(view.steps[7]).toMatchObject({ state: 'done', summary: 'Signed by JJ · rated 4/5' })
    expect(view.previousStep?.key).toBe('tenant_sign_off')
    expect(view.steps[6].tag).toContain('previous flow')
  })

  it('uses the short flow for PPM orders', () => {
    const schedule = { title: 'Monthly AHU check', frequency: 'monthly', assets: { name: 'AHU-01' } }
    const scheduled = build({ status: 'scheduled', ppm_schedules: schedule, scheduled_date: '2026-06-10' }, { report: null })
    expect(scheduled.variant).toBe('ppm')
    expect(scheduled.steps.map((step) => step.key)).toEqual(['scheduled', 'work_execution', 'final_verification', 'tenant_sign_off', 'completed'])
    expect(scheduled.currentIndex).toBe(0)
    expect(scheduled.previousStep?.fields).toContainEqual({ label: 'Asset', value: 'AHU-01' })

    expect(build({ status: 'overdue', ppm_schedules: schedule }, { report: null }).steps[0].tag).toBe('Overdue')
    const onHold = build({ status: 'on_hold' }, { report: null })
    expect(onHold.currentIndex).toBe(1)
    expect(onHold.steps[1].tag).toBe('On hold')
  })

  it('shows every step as done once completed', () => {
    const view = build({ status: 'completed', signed_at: at(50), head_engineer_verified_at: at(45) })
    expect(view.currentIndex).toBeNull()
    expect(view.previousStep).toBeNull()
    expect(states(view).every((state) => state === 'done')).toBe(true)
    expect(view.steps[8]).toMatchObject({ summary: 'Work order closed', at: at(50) })
    expect(view.steps[8].files).toEqual([{ kind: 'document', label: 'Audit report (PDF)', url: '/api/pdf/wo-1/audit' }])
  })
})
