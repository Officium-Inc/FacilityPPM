import { describe, expect, it } from 'vitest'
import { formatPHTDateTime } from '@/lib/utils'
import { formatPeso, latestCosting } from '@/lib/costing'

describe('formatPHTDateTime', () => {
  it('formats in Philippine Time with a 12-hour clock', () => {
    expect(formatPHTDateTime('2026-06-02T01:14:00Z')).toBe('02 Jun 2026, 9:14 AM')
    expect(formatPHTDateTime('2026-06-08T09:12:00Z')).toBe('08 Jun 2026, 5:12 PM')
    expect(formatPHTDateTime('2026-06-02T09:14:00+08:00')).toBe('02 Jun 2026, 9:14 AM')
  })

  it('handles midnight, noon and the date change at 16:00 UTC', () => {
    expect(formatPHTDateTime('2026-06-01T16:00:00Z')).toBe('02 Jun 2026, 12:00 AM')
    expect(formatPHTDateTime('2026-06-02T04:00:00Z')).toBe('02 Jun 2026, 12:00 PM')
    expect(formatPHTDateTime('2026-12-31T16:30:00Z')).toBe('01 Jan 2027, 12:30 AM')
  })

  it('returns a dash for missing or invalid dates', () => {
    expect(formatPHTDateTime(null)).toBe('—')
    expect(formatPHTDateTime(undefined)).toBe('—')
    expect(formatPHTDateTime('not a date')).toBe('—')
  })
})

describe('formatPeso', () => {
  it('formats pesos with two decimals and thousands separators', () => {
    expect(formatPeso(7000)).toBe('₱7,000.00')
    expect(formatPeso('2000')).toBe('₱2,000.00')
    expect(formatPeso(1234.567)).toBe('₱1,234.57')
  })

  it('treats missing or invalid amounts as zero', () => {
    expect(formatPeso(null)).toBe('₱0.00')
    expect(formatPeso(undefined)).toBe('₱0.00')
    expect(formatPeso('abc')).toBe('₱0.00')
  })
})

describe('latestCosting', () => {
  it('picks the newest estimate, falling back to created_at', () => {
    const first = { id: 'a', submitted_at: '2026-06-03T02:00:00Z', created_at: '2026-06-03T02:00:00Z' }
    const revision = { id: 'b', submitted_at: '2026-06-04T02:00:00Z', created_at: '2026-06-04T02:00:00Z' }
    const undated = { id: 'c', submitted_at: null, created_at: '2026-06-05T02:00:00Z' }
    expect(latestCosting([revision, first])?.id).toBe('b')
    expect(latestCosting([first, revision, undated])?.id).toBe('c')
  })

  it('accepts a single embedded row or nothing', () => {
    expect(latestCosting({ id: 'only', submitted_at: null })?.id).toBe('only')
    expect(latestCosting([])).toBeNull()
    expect(latestCosting(null)).toBeNull()
  })
})
