import { createHash, randomBytes } from 'crypto'

/** A new link token (256 random bits, URL-safe). Store only `hashToken(token)`; the raw token goes in the email. */
export function generateLinkToken(): string {
  return randomBytes(32).toString('base64url')
}

/** SHA-256 hex of a link token, as stored in `*_token_hash` columns (matches migration 024). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Link tokens are short; anything longer is not one of ours and is rejected before hashing. */
export function isPlausibleToken(token: string | null | undefined): token is string {
  return typeof token === 'string' && token.length >= 16 && token.length <= 128
}

export function generateSignOffToken(): string {
  return generateLinkToken()
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
