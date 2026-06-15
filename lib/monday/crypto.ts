import crypto from 'crypto'

const CIPHER = 'aes-256-gcm'
const VERSION = 'v1'

function encryptionKey() {
  const secret = process.env.MONDAY_CREDENTIAL_ENCRYPTION_KEY?.trim()
  if (!secret || secret.length < 32) {
    throw new Error('Monday token encryption is not configured. Add MONDAY_CREDENTIAL_ENCRYPTION_KEY to .env.local with at least 32 characters, then restart the app.')
  }
  return crypto.createHash('sha256').update(secret).digest()
}

export function encryptMondayToken(token: string) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(CIPHER, encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [
    VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':')
}

export function decryptMondayToken(value: string) {
  const [version, ivText, tagText, encryptedText] = value.split(':')
  if (version !== VERSION || !ivText || !tagText || !encryptedText) {
    throw new Error('Stored Monday token uses an unsupported encrypted format.')
  }

  const decipher = crypto.createDecipheriv(CIPHER, encryptionKey(), Buffer.from(ivText, 'base64'))
  decipher.setAuthTag(Buffer.from(tagText, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

export function maskMondayToken(token: string) {
  const clean = token.trim()
  return clean.slice(-4)
}
