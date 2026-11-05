import { describe, expect, it } from 'vitest'
import {
  costingDecisionBlocker,
  isAwaitingSignOff,
  parseCostingDecision,
  parseSignOffDecision,
  signOffDecisionBlocker,
  MAX_SIGNATURE_LENGTH,
  type CostingDecisionRecord,
  type SignOffDecisionRecord,
} from '@/lib/approval-rules'

const PNG = 'data:image/png;base64,iVBORw0KGgo='
const past = new Date(Date.now() - 60_000).toISOString()
const future = new Date(Date.now() + 60_000).toISOString()

function costingRecord(overrides: Partial<CostingDecisionRecord> = {}): CostingDecisionRecord {
  return {
    id: 'wo-1',
    wo_number: 'REPT-1',
    status: 'pending_approval',
    property_id: 'p-1',
    costing_token_expires_at: future,
    costing_approved_at: null,
    tenant_email: 'tenant@example.com',
    tenant_name: 'Tenant',
    ...overrides,
  }
}

function signOffRecord(overrides: Partial<SignOffDecisionRecord> = {}): SignOffDecisionRecord {
  return {
    id: 'wo-1',
    wo_number: 'REPT-1',
    status: 'verified',
    property_id: 'p-1',
    engineer_id: 'e-1',
    company_id: 'c-1',
    floor_id: 'f-1',
    sign_off_token: 'token',
    sign_off_expires_at: future,
    signed_at: null,
    tenant_email: 'tenant@example.com',
    tenant_name: 'Tenant',
    head_engineer_verified_at: past,
    ...overrides,
  }
}

describe('parseCostingDecision', () => {
  it('accepts an approval with an optional PNG signature', () => {
    expect(parseCostingDecision({ action: 'approve', tenantName: '  Ana  ' })).toEqual({
      action: 'approve',
      approverName: 'Ana',
      signatureData: null,
      reason: null,
    })
    expect(parseCostingDecision({ action: 'approve', tenantName: 'Ana', signatureData: PNG })).toMatchObject({ signatureData: PNG })
  })

  it('rejects unknown actions, missing names and non-PNG or oversized signatures', () => {
    expect(parseCostingDecision({ action: 'delete', tenantName: 'Ana' })).toEqual({ error: 'Invalid action.' })
    expect(parseCostingDecision(null)).toEqual({ error: 'Invalid action.' })
    expect(parseCostingDecision({ action: 'approve', tenantName: '   ' })).toEqual({ error: 'Tenant name is required.' })
    expect(parseCostingDecision({ action: 'approve', tenantName: 'Ana', signatureData: 'data:text/html;base64,PGh0bWw+' }))
      .toEqual({ error: 'Invalid signature format.' })
    expect(parseCostingDecision({ action: 'approve', tenantName: 'Ana', signatureData: PNG + 'A'.repeat(MAX_SIGNATURE_LENGTH) }))
      .toEqual({ error: 'Invalid signature format.' })
  })

  it('requires a reason to reject and drops any signature', () => {
    expect(parseCostingDecision({ action: 'reject', tenantName: 'Ana' })).toEqual({ error: 'Rejection reason is required.' })
    expect(parseCostingDecision({ action: 'reject', tenantName: 'Ana', reason: 'Too high', signatureData: PNG })).toEqual({
      action: 'reject',
      approverName: 'Ana',
      signatureData: null,
      reason: 'Too high',
    })
  })

  it('caps the approver name length', () => {
    const result = parseCostingDecision({ action: 'approve', tenantName: 'x'.repeat(500) })
    expect('approverName' in result && result.approverName.length).toBe(120)
  })
})

describe('costingDecisionBlocker', () => {
  it('allows a pending estimate', () => {
    expect(costingDecisionBlocker(costingRecord(), true)).toBeNull()
  })

  it('blocks cancelled, already reviewed and no-longer-pending estimates', () => {
    expect(costingDecisionBlocker(costingRecord({ status: 'cancelled' }), true)).toMatchObject({ ok: false, status: 410 })
    expect(costingDecisionBlocker(costingRecord({ costing_approved_at: past }), true)).toMatchObject({ ok: false, status: 409 })
    // A waived order keeps its old link but no longer has a pending estimate
    expect(costingDecisionBlocker(costingRecord({ status: 'assigned' }), true)).toMatchObject({ ok: false, status: 409 })
    expect(costingDecisionBlocker(costingRecord({ status: 'costing' }), false)).toMatchObject({ ok: false, status: 409 })
  })

  it('enforces link expiry only for public links', () => {
    const expired = costingRecord({ costing_token_expires_at: past })
    expect(costingDecisionBlocker(expired, true)).toMatchObject({ ok: false, status: 410 })
    expect(costingDecisionBlocker(expired, false)).toBeNull()
  })
})

describe('parseSignOffDecision', () => {
  it('requires a name and a PNG signature to approve', () => {
    expect(parseSignOffDecision({ action: 'approve', signedByName: 'Ana' })).toEqual({ error: 'Missing signature or name.' })
    expect(parseSignOffDecision({ action: 'approve', signatureData: PNG })).toEqual({ error: 'Missing signature or name.' })
    expect(parseSignOffDecision({ action: 'approve', signedByName: 'Ana', signatureData: 'data:image/svg+xml;base64,PHN2Zz4=' }))
      .toEqual({ error: 'Invalid signature format.' })
  })

  it('keeps only whole ratings from 1 to 5', () => {
    const base = { action: 'approve', signedByName: 'Ana', signatureData: PNG }
    expect(parseSignOffDecision({ ...base, rating: 4, ratingComment: ' Great ' })).toMatchObject({ rating: 4, ratingComment: 'Great' })
    expect(parseSignOffDecision({ ...base, rating: 9 })).toMatchObject({ rating: null })
    expect(parseSignOffDecision({ ...base, rating: 2.5 })).toMatchObject({ rating: null })
    expect(parseSignOffDecision({ ...base, rating: '5' })).toMatchObject({ rating: null })
  })

  it('requires a reason to reject and keeps only string flagged items', () => {
    expect(parseSignOffDecision({ action: 'reject' })).toEqual({ error: 'Rejection reason is required.' })
    expect(parseSignOffDecision({ action: 'reject', rejectionReason: 'Leak remains', flaggedItems: ['a', 3, null, 'b'] })).toEqual({
      action: 'reject',
      rejectionReason: 'Leak remains',
      flaggedItems: ['a', 'b'],
    })
  })

  it('rejects unknown actions', () => {
    expect(parseSignOffDecision({ action: 'sign' })).toEqual({ error: 'Invalid action.' })
    expect(parseSignOffDecision(undefined)).toEqual({ error: 'Invalid action.' })
  })
})

describe('sign-off state', () => {
  it('is awaiting the tenant when verified, or a legacy svc_submitted order with a link', () => {
    expect(isAwaitingSignOff({ status: 'verified' })).toBe(true)
    expect(isAwaitingSignOff({ status: 'svc_submitted', sign_off_token: 'token' })).toBe(true)
    expect(isAwaitingSignOff({ status: 'svc_submitted', sign_off_token: null })).toBe(false)
    expect(isAwaitingSignOff({ status: 'in_progress', sign_off_token: 'token' })).toBe(false)
  })

  it('blocks cancelled, signed and not-ready work orders', () => {
    expect(signOffDecisionBlocker(signOffRecord(), true)).toBeNull()
    expect(signOffDecisionBlocker(signOffRecord({ status: 'cancelled' }), true)).toMatchObject({ ok: false, status: 410 })
    expect(signOffDecisionBlocker(signOffRecord({ signed_at: past }), true)).toMatchObject({ ok: false, status: 409 })
    expect(signOffDecisionBlocker(signOffRecord({ status: 'in_progress' }), false)).toMatchObject({ ok: false, status: 409 })
  })

  it('enforces link expiry only for public links', () => {
    const expired = signOffRecord({ sign_off_expires_at: past })
    expect(signOffDecisionBlocker(expired, true)).toMatchObject({ ok: false, status: 410 })
    expect(signOffDecisionBlocker(expired, false)).toBeNull()
  })
})
