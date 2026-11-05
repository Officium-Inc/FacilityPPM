import { describe, expect, it } from 'vitest'
import { MAX_TEXT_LENGTH } from '@/lib/approval-rules'
import { parseSendBack, sendBackBlocker } from '@/lib/verification-rules'

describe('parseSendBack', () => {
  it('requires a note', () => {
    expect(parseSendBack({ reason: 'Joint still leaking' })).toEqual({ reason: 'Joint still leaking' })
    expect(parseSendBack({ reason: '   ' })).toHaveProperty('error')
    expect(parseSendBack({})).toHaveProperty('error')
    expect(parseSendBack(null)).toHaveProperty('error')
    expect(parseSendBack({ reason: 42 })).toHaveProperty('error')
  })

  it('trims the note and caps its length', () => {
    expect(parseSendBack({ reason: '  Redo the seal  ' })).toEqual({ reason: 'Redo the seal' })
    const long = parseSendBack({ reason: 'x'.repeat(MAX_TEXT_LENGTH + 50) })
    expect('reason' in long && long.reason.length).toBe(MAX_TEXT_LENGTH)
  })
})

describe('sendBackBlocker', () => {
  it('allows work that is waiting for final verification', () => {
    expect(sendBackBlocker({ status: 'svc_submitted', signed_at: null })).toBeNull()
  })

  it('blocks any other state', () => {
    for (const status of ['in_progress', 'verified', 'signed', 'completed', 'cancelled']) {
      expect(sendBackBlocker({ status, signed_at: null })).toMatchObject({ ok: false, status: 409 })
    }
  })

  it('blocks work the tenant already signed off', () => {
    expect(sendBackBlocker({ status: 'svc_submitted', signed_at: '2026-06-08T09:00:00Z' })).toMatchObject({ ok: false, status: 409 })
  })
})
