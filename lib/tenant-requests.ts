import type { WorkOrderStatus } from '@/types'

/**
 * Tenant Portal request lists: filters, counts, what the tenant is asked to do, and the plain row shape
 * passed to client components. Client-safe (no server imports); `lib/tenant.ts` loads the rows.
 */

export type TenantRequestFilter =
  | 'my-requests'
  | 'pending'
  | 'for-my-approval'
  | 'complete'
  | 'cancelled'

/** Tab order on the Service Reports pages. */
export const TENANT_REQUEST_FILTERS: TenantRequestFilter[] = [
  'my-requests',
  'pending',
  'for-my-approval',
  'complete',
  'cancelled',
]

export const TENANT_REQUEST_TITLES: Record<TenantRequestFilter, string> = {
  'my-requests': 'All Reports',
  pending: 'Pending',
  'for-my-approval': 'For My Approval',
  complete: 'Complete',
  cancelled: 'Cancelled',
}

/** What a request is waiting for the tenant to do. */
export type TenantAction = 'cost_approval' | 'sign_off'

export const TENANT_ACTION_LABELS: Record<TenantAction, { title: string; button: string }> = {
  cost_approval: { title: 'Cost estimate to approve', button: 'Review estimate' },
  sign_off: { title: 'Finished work to sign off', button: 'Review & sign off' },
}

type ActionFields = { status: WorkOrderStatus; sign_off_token_hash: string | null }

/**
 * Flow: ... in_progress -> svc_submitted (final verification by the head engineer)
 * -> verified (waiting for the tenant to sign off) -> completed.
 * `signed` is the legacy "tenant signed, not yet verified" state.
 * A legacy svc_submitted order that already has a sign-off link is still waiting on the tenant.
 */
export function tenantActionFor(row: ActionFields): TenantAction | null {
  if (row.status === 'pending_approval') return 'cost_approval'
  if (row.status === 'verified') return 'sign_off'
  if (row.status === 'svc_submitted' && Boolean(row.sign_off_token_hash)) return 'sign_off'
  return null
}

export function isAwaitingTenant(row: ActionFields) {
  return tenantActionFor(row) !== null
}

const STATUS_GROUPS: Record<'pending' | 'complete' | 'cancelled', WorkOrderStatus[]> = {
  // Open work with the property team; scheduled, overdue and on-hold orders are still open
  pending: ['new_report', 'inspecting', 'costing', 'assigned', 'scheduled', 'overdue', 'in_progress', 'on_hold', 'svc_submitted'],
  complete: ['signed', 'completed'],
  cancelled: ['cancelled'],
}

export function matchesTenantFilter(row: ActionFields, filter: TenantRequestFilter) {
  if (filter === 'my-requests') return true
  if (filter === 'for-my-approval') return isAwaitingTenant(row)
  if (filter === 'pending') return STATUS_GROUPS.pending.includes(row.status) && !isAwaitingTenant(row)
  return STATUS_GROUPS[filter].includes(row.status)
}

export function countTenantRequests(rows: ActionFields[]): Record<TenantRequestFilter, number> {
  const counts = Object.fromEntries(TENANT_REQUEST_FILTERS.map((filter) => [filter, 0])) as Record<TenantRequestFilter, number>
  for (const row of rows) {
    for (const filter of TENANT_REQUEST_FILTERS) {
      if (matchesTenantFilter(row, filter)) counts[filter] += 1
    }
  }
  return counts
}

export function tenantRequestsHref(slug: string, filter: TenantRequestFilter) {
  return `/${slug}/tenant/service-requests/${filter}`
}

/** One request as the list components show it. Plain data only: no token hashes or stored file URLs. */
export interface TenantRequestListItem {
  id: string
  number: string
  description: string | null
  /** Floor and location notes, e.g. "15th Floor · pantry". */
  location: string | null
  /** Priority name, or null before an engineer assesses it. */
  priority: string | null
  status: WorkOrderStatus
  /** Submission date in Philippine Time, e.g. "20 Oct 2026". */
  submitted: string
  /** The review page when the tenant must act, otherwise the detail page. */
  href: string
  action: TenantAction | null
}

/** Case-insensitive match on the report number, description and location. */
export function matchesTenantSearch(item: Pick<TenantRequestListItem, 'number' | 'description' | 'location'>, query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [item.number, item.description, item.location].some((value) => value?.toLowerCase().includes(needle))
}
