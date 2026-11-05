import { describe, expect, it } from 'vitest'
import { generateLinkToken, hashToken, isPlausibleToken } from '@/lib/token'

describe('link tokens', () => {
  it('generates distinct URL-safe 256-bit tokens', () => {
    const a = generateLinkToken()
    const b = generateLinkToken()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('hashes like migration 024 (hex SHA-256 of the UTF-8 token)', () => {
    // select encode(sha256(convert_to('abc', 'UTF8')), 'hex')
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(hashToken('abc')).not.toBe(hashToken('abd'))
  })

  it('accepts token-shaped input only', () => {
    expect(isPlausibleToken(generateLinkToken())).toBe(true)
    expect(isPlausibleToken('2f1c5e8a-7d3b-4c9e-9a1f-0b2c3d4e5f60')).toBe(true) // older UUID links
    expect(isPlausibleToken('short')).toBe(false)
    expect(isPlausibleToken('x'.repeat(500))).toBe(false)
    expect(isPlausibleToken(undefined)).toBe(false)
  })
})
