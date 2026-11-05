import type { LicenseStatus } from '@/types'

/** License rules for property accounts (D17): `license_status` plus an optional `license_expires_at`. */

export const LICENSE_STATUSES: readonly LicenseStatus[] = ['active', 'trial', 'suspended']

/** What a property's license means right now; an expired license is treated as suspended. */
export type LicenseState = LicenseStatus | 'expired'

/** Philippine time: licenses run to the end of the chosen day in the business timezone. */
const BUSINESS_UTC_OFFSET = '+08:00'
const BUSINESS_OFFSET_MS = 8 * 60 * 60 * 1000

export function isLicenseStatus(value: unknown): value is LicenseStatus {
  return typeof value === 'string' && (LICENSE_STATUSES as readonly string[]).includes(value)
}

/** `YYYY-MM-DD` → ISO timestamp at the end of that day (business time), or null for an invalid date. */
export function licenseExpiryFromDate(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const value = new Date(`${date}T23:59:59.999${BUSINESS_UTC_OFFSET}`)
  if (Number.isNaN(value.getTime())) return null
  // Reject dates that roll over, e.g. 2026-02-30
  return licenseDateInput(value.toISOString()) === date ? value.toISOString() : null
}

/** ISO timestamp → `YYYY-MM-DD` in business time, for date inputs and labels. */
export function licenseDateInput(expiresAt: string | null | undefined) {
  if (!expiresAt) return ''
  const value = new Date(expiresAt)
  if (Number.isNaN(value.getTime())) return ''
  return new Date(value.getTime() + BUSINESS_OFFSET_MS).toISOString().slice(0, 10)
}

export function licenseState(
  property: { license_status: LicenseStatus | string; license_expires_at?: string | null },
  now = new Date()
): LicenseState {
  if (property.license_status === 'suspended') return 'suspended'
  if (property.license_expires_at && new Date(property.license_expires_at) < now) return 'expired'
  return isLicenseStatus(property.license_status) ? property.license_status : 'suspended'
}

export interface LicenseUpdate {
  license_status?: LicenseStatus
  /** null clears the expiry (no end date). */
  license_expires_at?: string | null
}

/**
 * Validates a license change from the Provider Dashboard. `license_expires_at` takes a `YYYY-MM-DD` date
 * (or null/'' to clear it); an expiry must not be in the past — suspend the license instead.
 */
export function parseLicenseUpdate(body: unknown, now = new Date()): LicenseUpdate | { error: string } {
  const input = (body ?? {}) as Record<string, unknown>
  const update: LicenseUpdate = {}

  if (input.license_status !== undefined) {
    if (!isLicenseStatus(input.license_status)) return { error: 'Invalid license status.' }
    update.license_status = input.license_status
  }

  if (input.license_expires_at !== undefined) {
    const raw = input.license_expires_at
    if (raw === null || raw === '') {
      update.license_expires_at = null
    } else {
      const expiresAt = typeof raw === 'string' ? licenseExpiryFromDate(raw) : null
      if (!expiresAt) return { error: 'Invalid expiry date.' }
      if (new Date(expiresAt) < now) return { error: 'The expiry date has already passed. Suspend the license instead.' }
      update.license_expires_at = expiresAt
    }
  }

  return update
}
