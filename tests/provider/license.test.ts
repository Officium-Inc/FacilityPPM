import { describe, expect, it } from 'vitest'
import {
  isLicenseStatus,
  licenseDateInput,
  licenseExpiryFromDate,
  licenseState,
  parseLicenseUpdate,
} from '@/lib/provider/license'
import { describeAuditEntry } from '@/lib/provider/audit-labels'

const NOW = new Date('2026-06-15T04:00:00.000Z') // 12:00 in Manila

describe('license expiry dates', () => {
  it('ends a license at the end of the chosen day in Philippine time', () => {
    expect(licenseExpiryFromDate('2026-12-31')).toBe('2026-12-31T15:59:59.999Z')
    expect(licenseDateInput('2026-12-31T15:59:59.999Z')).toBe('2026-12-31')
  })

  it('rejects malformed and rolled-over dates', () => {
    expect(licenseExpiryFromDate('2026-02-30')).toBeNull()
    expect(licenseExpiryFromDate('31/12/2026')).toBeNull()
    expect(licenseExpiryFromDate('2026-13-01')).toBeNull()
    expect(licenseDateInput(null)).toBe('')
    expect(licenseDateInput('not a date')).toBe('')
  })
})

describe('licenseState', () => {
  it('treats suspended and expired licenses as locked', () => {
    expect(licenseState({ license_status: 'suspended', license_expires_at: null }, NOW)).toBe('suspended')
    expect(licenseState({ license_status: 'active', license_expires_at: '2026-06-14T15:59:59.999Z' }, NOW)).toBe('expired')
    expect(licenseState({ license_status: 'trial', license_expires_at: '2026-06-15T15:59:59.999Z' }, NOW)).toBe('trial')
    expect(licenseState({ license_status: 'active' }, NOW)).toBe('active')
  })

  it('fails closed on unknown statuses', () => {
    expect(licenseState({ license_status: 'gold' }, NOW)).toBe('suspended')
    expect(isLicenseStatus('gold')).toBe(false)
    expect(isLicenseStatus('trial')).toBe(true)
  })
})

describe('parseLicenseUpdate', () => {
  it('accepts a status and a future expiry date', () => {
    expect(parseLicenseUpdate({ license_status: 'active', license_expires_at: '2026-12-31' }, NOW)).toEqual({
      license_status: 'active',
      license_expires_at: '2026-12-31T15:59:59.999Z',
    })
  })

  it('clears the expiry with null or an empty string', () => {
    expect(parseLicenseUpdate({ license_expires_at: null }, NOW)).toEqual({ license_expires_at: null })
    expect(parseLicenseUpdate({ license_expires_at: '' }, NOW)).toEqual({ license_expires_at: null })
  })

  it('allows today but rejects past dates, invalid dates and unknown statuses', () => {
    expect(parseLicenseUpdate({ license_expires_at: '2026-06-15' }, NOW)).toEqual({ license_expires_at: '2026-06-15T15:59:59.999Z' })
    expect(parseLicenseUpdate({ license_expires_at: '2026-06-14' }, NOW)).toHaveProperty('error')
    expect(parseLicenseUpdate({ license_expires_at: '2026-02-30' }, NOW)).toEqual({ error: 'Invalid expiry date.' })
    expect(parseLicenseUpdate({ license_expires_at: 12345 }, NOW)).toEqual({ error: 'Invalid expiry date.' })
    expect(parseLicenseUpdate({ license_status: 'expired' }, NOW)).toEqual({ error: 'Invalid license status.' })
  })

  it('ignores fields that are not license fields', () => {
    expect(parseLicenseUpdate({ name: 'Tower', role: 'provider' }, NOW)).toEqual({})
  })
})

describe('describeAuditEntry', () => {
  it('describes license and account events', () => {
    expect(describeAuditEntry({
      action: 'license.updated',
      metadata: { from: { status: 'trial', expires_at: null }, to: { status: 'active', expires_at: '2026-12-31T15:59:59.999Z' } },
    })).toBe('License changed from trial (no end date) to active (until 2026-12-31)')
    expect(describeAuditEntry({
      action: 'account.terminated',
      metadata: { deactivated_member_ids: ['a', 'b'], banned_user_ids: ['u'], reason: 'Contract ended' },
    })).toBe('Account terminated: 2 members deactivated, 1 sign-in blocked — Contract ended')
  })

  it('falls back to the action name', () => {
    expect(describeAuditEntry({ action: 'something.new_thing', metadata: null })).toBe('something new thing')
  })
})
