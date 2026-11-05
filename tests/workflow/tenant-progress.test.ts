import { describe, expect, it } from 'vitest'
import { buildTenantProgress, tenantNextStep, type TenantProgressInput } from '@/lib/tenant-progress'
import { formatPHT } from '@/lib/utils'
import type { WorkOrderStatus } from '@/types'

const base = (status: WorkOrderStatus, extra: Partial<TenantProgressInput> = {}): TenantProgressInput => ({
  status,
  hasSignOffLink: false,
  createdAt: '2026-10-20T06:27:00Z',
  updatedAt: '2026-10-25T07:46:00Z',
  events: [],
  ...extra,
})

const states = (input: TenantProgressInput) => buildTenantProgress(input).steps.map((step) => step.state)

describe('buildTenantProgress', () => {
  it('marks a new report as submitted and waiting for inspection', () => {
    const progress = buildTenantProgress(base('new_report'))
    expect(progress.currentIndex).toBe(1)
    expect(progress.steps.map((step) => step.key)).toEqual(['submitted', 'inspection', 'approval', 'work', 'sign_off', 'completed'])
    expect(states(base('new_report'))).toEqual(['done', 'current', 'upcoming', 'upcoming', 'upcoming', 'upcoming'])
    expect(progress.steps[0].atLabel).toBe(formatPHT('2026-10-20T06:27:00Z'))
  })

  it('folds costing into Inspection and assignment, work and verification into Work', () => {
    expect(buildTenantProgress(base('costing')).currentIndex).toBe(1)
    for (const status of ['assigned', 'scheduled', 'overdue', 'in_progress', 'on_hold', 'svc_submitted'] as const) {
      expect(buildTenantProgress(base(status)).currentIndex, status).toBe(3)
    }
  })

  it('flags the steps that wait for the tenant', () => {
    const approval = buildTenantProgress(base('pending_approval'))
    expect(approval.steps[approval.currentIndex!]).toMatchObject({ key: 'approval', yours: true, state: 'current' })

    const signOff = buildTenantProgress(base('verified'))
    expect(signOff.steps[signOff.currentIndex!]).toMatchObject({ key: 'sign_off', yours: true })

    const legacy = buildTenantProgress(base('svc_submitted', { hasSignOffLink: true }))
    expect(legacy.steps[legacy.currentIndex!].key).toBe('sign_off')
  })

  it('dates finished steps from the work order columns, falling back to events', () => {
    const progress = buildTenantProgress(base('verified', {
      costingApprovedAt: '2026-10-21T02:00:00Z',
      events: [
        { event_type: 'inspection_completed', created_at: '2026-10-20T08:00:00Z' },
        { event_type: 'costing_submitted', created_at: '2026-10-20T09:00:00Z' },
        { event_type: 'costing_submitted', created_at: '2026-10-20T12:00:00Z' },
        { event_type: 'final_verified', created_at: '2026-10-24T03:00:00Z' },
      ],
    }))
    const at = Object.fromEntries(progress.steps.map((step) => [step.key, step.atLabel]))
    expect(at.inspection).toBe(formatPHT('2026-10-20T12:00:00Z'))
    expect(at.approval).toBe(formatPHT('2026-10-21T02:00:00Z'))
    expect(at.work).toBe(formatPHT('2026-10-24T03:00:00Z'))
    expect(at.sign_off).toBeNull()
  })

  it('leaves a finished step undated when nothing was recorded', () => {
    const progress = buildTenantProgress(base('in_progress'))
    expect(progress.steps.find((step) => step.key === 'approval')).toMatchObject({ state: 'done', atLabel: null })
  })

  it('marks everything done once completed', () => {
    const progress = buildTenantProgress(base('completed', { completedAt: '2026-10-26T01:00:00Z' }))
    expect(progress.currentIndex).toBeNull()
    expect(progress.steps.every((step) => step.state === 'done')).toBe(true)
    expect(progress.steps.at(-1)?.atLabel).toBe(formatPHT('2026-10-26T01:00:00Z'))
  })

  it('treats the legacy signed state as closing, with sign-off done', () => {
    const progress = buildTenantProgress(base('signed', { signedAt: '2026-10-25T01:00:00Z' }))
    expect(progress.steps[progress.currentIndex!].key).toBe('completed')
    expect(progress.steps.find((step) => step.key === 'sign_off')).toMatchObject({ state: 'done', atLabel: formatPHT('2026-10-25T01:00:00Z') })
  })

  it('shows only the submission as done for a cancelled report', () => {
    const progress = buildTenantProgress(base('cancelled'))
    expect(progress.currentIndex).toBeNull()
    expect(states(base('cancelled'))).toEqual(['done', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming'])
    expect(progress.next).toBeNull()
  })
})

describe('tenantNextStep', () => {
  it('names the assigned engineer and the due date', () => {
    expect(tenantNextStep(base('assigned', { engineerName: ' Erick ', dueDate: '2026-10-22' })))
      .toBe(`Erick is assigned to the work, due ${formatPHT('2026-10-22')}.`)
    expect(tenantNextStep(base('in_progress', { engineerName: 'Erick' }))).toBe('Erick is working on it.')
  })

  it('falls back to neutral wording without an engineer', () => {
    expect(tenantNextStep(base('assigned'))).toBe('The work is being scheduled.')
    expect(tenantNextStep(base('in_progress', { engineerName: '  ' }))).toBe('The work is in progress.')
  })

  it('separates the head engineer check from a legacy order waiting for sign-off', () => {
    expect(tenantNextStep(base('svc_submitted'))).toMatch(/head engineer is checking/)
    expect(tenantNextStep(base('svc_submitted', { hasSignOffLink: true }))).toMatch(/waiting for your sign-off/)
  })
})
