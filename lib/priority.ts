import type { Priority } from '@/types'

export interface PriorityOption {
  value: Priority
  label: string
  /** Target response time, shown next to the priority name. */
  sla: string
  /** Suggested due date offset in days from today; null means the engineer schedules it. */
  dueInDays: number | null
}

export const PRIORITY_OPTIONS: PriorityOption[] = [
  { value: 'low', label: 'Low', sla: 'Within a month / scheduled by engineer', dueInDays: null },
  { value: 'medium', label: 'Medium', sla: '3-7 days', dueInDays: 7 },
  { value: 'high', label: 'High', sla: '24-48 hours', dueInDays: 2 },
  { value: 'critical', label: 'Critical', sla: 'Within 1 hour', dueInDays: 0 },
]

const PRIORITY_VALUES = new Set<string>(PRIORITY_OPTIONS.map((option) => option.value))

export function isPriority(value: unknown): value is Priority {
  return typeof value === 'string' && PRIORITY_VALUES.has(value)
}

export function getPriorityOption(priority: string | null | undefined) {
  return PRIORITY_OPTIONS.find((option) => option.value === priority) ?? null
}

/** "Medium - 3-7 days" */
export function priorityOptionLabel(option: PriorityOption) {
  return `${option.label} - ${option.sla}`
}

/** "Medium" or "Not assessed" when the engineer has not set a priority yet. */
export function priorityLabel(priority: string | null | undefined, fallback = 'Not assessed') {
  return getPriorityOption(priority)?.label ?? fallback
}

/** YYYY-MM-DD (Asia/Manila) suggested from the priority SLA, or '' when the engineer schedules it. */
export function suggestDueDate(priority: string | null | undefined, from = new Date()) {
  const days = getPriorityOption(priority)?.dueInDays
  if (days === null || days === undefined) return ''

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(from)
  const [year, month, day] = today.split('-').map(Number)
  const due = new Date(Date.UTC(year, month - 1, day + days))
  return due.toISOString().slice(0, 10)
}
