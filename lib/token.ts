import { createHash } from 'crypto'

export function generateSignOffToken(): string {
  return crypto.randomUUID()
}

export function generateRecordHash(data: Record<string, unknown>): string {
  const payload = JSON.stringify(data, Object.keys(data).sort())
  return createHash('sha256').update(payload).digest('hex')
}

export function getSignOffExpiry(): Date {
  const expiry = new Date()
  expiry.setHours(expiry.getHours() + 48)
  return expiry
}
