import { describe, expect, it } from 'vitest'
import {
  countTenantRequests,
  isAwaitingTenant,
  matchesTenantFilter,
  matchesTenantSearch,
  tenantActionFor,
} from '@/lib/tenant-requests'
import type { WorkOrderStatus } from '@/types'

const row = (status: WorkOrderStatus, sign_off_token_hash: string | null = null) => ({ status, sign_off_token_hash })

describe('tenantActionFor', () => {
  it('asks for cost approval on pending_approval and sign-off on verified', () => {
    expect(tenantActionFor(row('pending_approval'))).toBe('cost_approval')
    expect(tenantActionFor(row('verified'))).toBe('sign_off')
  })

  it('treats a legacy svc_submitted order with a sign-off link as waiting for sign-off', () => {
    expect(tenantActionFor(row('svc_submitted', 'hash'))).toBe('sign_off')
    expect(tenantActionFor(row('svc_submitted'))).toBeNull()
  })

  it('asks nothing of the tenant in the other states', () => {
    for (const status of ['new_report', 'inspecting', 'costing', 'assigned', 'in_progress', 'signed', 'completed', 'cancelled'] as const) {
      expect(isAwaitingTenant(row(status))).toBe(false)
    }
  })
})

describe('matchesTenantFilter', () => {
  it('keeps open work in Pending, including on-hold, scheduled and overdue orders', () => {
    for (const status of ['new_report', 'assigned', 'in_progress', 'on_hold', 'scheduled', 'overdue', 'svc_submitted'] as const) {
      expect(matchesTenantFilter(row(status), 'pending')).toBe(true)
    }
  })

  it('moves requests waiting for the tenant out of Pending into For My Approval', () => {
    expect(matchesTenantFilter(row('svc_submitted', 'hash'), 'pending')).toBe(false)
    expect(matchesTenantFilter(row('svc_submitted', 'hash'), 'for-my-approval')).toBe(true)
    expect(matchesTenantFilter(row('pending_approval'), 'pending')).toBe(false)
  })

  it('puts every request in exactly one of Pending, For My Approval, Complete and Cancelled', () => {
    const statuses: WorkOrderStatus[] = [
      'scheduled', 'on_hold', 'cancelled', 'overdue', 'new_report', 'inspecting', 'costing',
      'pending_approval', 'assigned', 'in_progress', 'svc_submitted', 'signed', 'verified', 'completed',
    ]
    for (const status of statuses) {
      const groups = (['pending', 'for-my-approval', 'complete', 'cancelled'] as const)
        .filter((filter) => matchesTenantFilter(row(status), filter))
      expect(groups, status).toHaveLength(1)
    }
  })
})

describe('countTenantRequests', () => {
  it('counts each tab, with All Reports as the total', () => {
    const counts = countTenantRequests([
      row('assigned'),
      row('costing'),
      row('pending_approval'),
      row('completed'),
      row('signed'),
      row('cancelled'),
    ])
    expect(counts).toEqual({
      'my-requests': 6,
      pending: 2,
      'for-my-approval': 1,
      complete: 2,
      cancelled: 1,
    })
  })
})

describe('matchesTenantSearch', () => {
  const item = { number: 'REPT-MVGAWWTR', description: 'Leaking pipe in pantry', location: '15th Floor · pantry' }

  it('matches the number, description or location, ignoring case and spaces around the query', () => {
    expect(matchesTenantSearch(item, 'mvgaw')).toBe(true)
    expect(matchesTenantSearch(item, '  LEAKING ')).toBe(true)
    expect(matchesTenantSearch(item, '15th')).toBe(true)
    expect(matchesTenantSearch(item, 'aircon')).toBe(false)
  })

  it('matches everything for an empty query and tolerates missing fields', () => {
    expect(matchesTenantSearch(item, '   ')).toBe(true)
    expect(matchesTenantSearch({ number: 'WO-1', description: null, location: null }, 'pipe')).toBe(false)
  })
})
