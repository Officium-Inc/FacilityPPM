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
