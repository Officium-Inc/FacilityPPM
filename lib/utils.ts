import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format a UTC date/timestamp string in Philippine Time (UTC+8, Asia/Manila). */
export function formatPHT(dateStr: string | null | undefined, includeTime = false): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (includeTime) {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Manila',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
  }
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const PHT_OFFSET_MS = 8 * 60 * 60 * 1000

/**
 * "02 Jun 2026, 9:14 AM" in Philippine Time. Built by hand (UTC+8 has no daylight saving) so the
 * server and the browser always produce the same text.
 */
export function formatPHTDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const time = new Date(dateStr).getTime()
  if (Number.isNaN(time)) return '—'
  const d = new Date(time + PHT_OFFSET_MS)
  const hours = d.getUTCHours()
  const day = String(d.getUTCDate()).padStart(2, '0')
  const minutes = String(d.getUTCMinutes()).padStart(2, '0')
  return `${day} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hours % 12 || 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`
}
