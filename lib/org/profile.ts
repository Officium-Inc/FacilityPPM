/** Organization profile fields (name and contact details). Pure, so it is unit-tested and client-safe. */

export const ORG_PROFILE_FIELDS = [
  'legal_name',
  'contact_email',
  'contact_phone',
  'address',
  'city',
  'country',
  'website',
] as const

export type OrgProfileField = (typeof ORG_PROFILE_FIELDS)[number]

export type OrgProfileUpdate = Partial<Record<OrgProfileField, string | null>> & { name?: string }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_LENGTH = 200

/** Validates a profile change; blank optional fields clear the value. Unknown keys are ignored. */
export function parseOrgProfile(body: unknown): OrgProfileUpdate | { error: string } {
  const input = (body ?? {}) as Record<string, unknown>
  const update: OrgProfileUpdate = {}

  if (input.name !== undefined) {
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (!name || name.length > 120) return { error: 'Name is required (up to 120 characters).' }
    update.name = name
  }

  for (const field of ORG_PROFILE_FIELDS) {
    if (input[field] === undefined) continue
    const raw = input[field]
    if (raw !== null && typeof raw !== 'string') return { error: `Invalid ${field.replace('_', ' ')}.` }
    const value = raw?.trim() || null
    if (value && value.length > MAX_LENGTH) return { error: `The ${field.replace('_', ' ')} is too long.` }
    if (field === 'contact_email' && value && !EMAIL_PATTERN.test(value)) return { error: 'Enter a valid contact email.' }
    update[field] = value
  }

  return update
}
