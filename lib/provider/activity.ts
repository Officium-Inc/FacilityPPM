import type { SupabaseClient } from '@supabase/supabase-js'

/** Read-only activity data for the Provider Dashboard. Callers must have passed `requireProviderPage()`. */

type Service = SupabaseClient

const OPEN_STATUSES = new Set(['new_report', 'inspecting', 'costing', 'assigned', 'in_progress', 'svc_submitted', 'scheduled', 'on_hold', 'overdue'])
const AWAITING_TENANT_STATUSES = new Set(['pending_approval', 'verified'])
const DONE_STATUSES = new Set(['signed', 'completed'])

export interface ActivityEvent {
  id: string
  event_type: string
  step: string
  actor_name: string | null
  actor_role: string | null
  decision: string | null
  created_at: string
  wo_number: string | null
  work_order_id: string | null
  property?: { name: string; slug: string } | null
}

export interface AuditEntry {
  id: string
  action: string
  entity_type: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  user_id: string | null
}

export interface PropertySummary {
  total: number
  open: number
  awaitingTenant: number
  completedLast30Days: number
  cancelled: number
  lastActivityAt: string | null
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function summarize(rows: Array<{ status: string; updated_at: string | null }>): PropertySummary {
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000
  let lastActivityAt: string | null = null
  const summary = { total: rows.length, open: 0, awaitingTenant: 0, completedLast30Days: 0, cancelled: 0 }
  for (const row of rows) {
    if (OPEN_STATUSES.has(row.status)) summary.open++
    if (AWAITING_TENANT_STATUSES.has(row.status)) summary.awaitingTenant++
    if (row.status === 'cancelled') summary.cancelled++
    if (DONE_STATUSES.has(row.status) && row.updated_at && new Date(row.updated_at).getTime() >= since) summary.completedLast30Days++
    if (row.updated_at && (!lastActivityAt || row.updated_at > lastActivityAt)) lastActivityAt = row.updated_at
  }
  return { ...summary, lastActivityAt }
}

function toEvent(row: Record<string, unknown>): ActivityEvent {
  const workOrder = one(row.work_orders as Record<string, unknown> | Record<string, unknown>[] | null)
  const property = workOrder ? one(workOrder.properties as { name: string; slug: string } | { name: string; slug: string }[] | null) : null
  return {
    id: row.id as string,
    event_type: row.event_type as string,
    step: row.step as string,
    actor_name: (row.actor_name as string | null) ?? null,
    actor_role: (row.actor_role as string | null) ?? null,
    decision: (row.decision as string | null) ?? null,
    created_at: row.created_at as string,
    wo_number: (workOrder?.wo_number as string | undefined) ?? null,
    work_order_id: (workOrder?.id as string | undefined) ?? null,
    property,
  }
}

/** Work order counts by status, recent workflow events and the audit log of one property. */
export async function loadPropertyActivity(service: Service, propertyId: string) {
  const [{ data: workOrders }, { data: events }, { data: audit }, { data: members }] = await Promise.all([
    service.from('work_orders').select('status, updated_at').eq('property_id', propertyId),
    service
      .from('work_order_events')
      .select('id, event_type, step, actor_name, actor_role, decision, created_at, work_orders!inner(id, wo_number, property_id)')
      .eq('work_orders.property_id', propertyId)
      .order('created_at', { ascending: false })
      .limit(25),
    service
      .from('audit_log')
      .select('id, action, entity_type, metadata, created_at, user_id')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })
      .limit(50),
    service.from('engineers').select('is_active').eq('property_id', propertyId),
  ])

  const rows = (workOrders ?? []) as Array<{ status: string; updated_at: string | null }>
  const statusCounts: Record<string, number> = {}
  for (const row of rows) statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1

  return {
    summary: summarize(rows),
    statusCounts,
    activeMembers: (members ?? []).filter((member) => member.is_active).length,
    events: (events ?? []).map((row) => toEvent(row as Record<string, unknown>)),
    audit: (audit ?? []) as AuditEntry[],
  }
}

export interface PropertyOverviewRow {
  id: string
  name: string
  slug: string
  license_status: string
  license_expires_at: string | null
  created_at: string
  summary: PropertySummary
  activeMembers: number
}

/** Every property with its work order summary and member count, plus (optionally) the latest events across properties. */
export async function loadProviderOverview(service: Service, options: { events?: boolean } = {}) {
  const [{ data: properties }, { data: workOrders }, { data: members }, { data: events }] = await Promise.all([
    service.from('properties').select('id, name, slug, license_status, license_expires_at, created_at').order('name'),
    service.from('work_orders').select('property_id, status, updated_at'),
    service.from('engineers').select('property_id, is_active'),
    options.events === false
      ? Promise.resolve({ data: [] })
      : service
          .from('work_order_events')
          .select('id, event_type, step, actor_name, actor_role, decision, created_at, work_orders!inner(id, wo_number, property_id, properties(name, slug))')
          .order('created_at', { ascending: false })
          .limit(30),
  ])

  const byProperty = new Map<string, Array<{ status: string; updated_at: string | null }>>()
  for (const row of (workOrders ?? []) as Array<{ property_id: string | null; status: string; updated_at: string | null }>) {
    if (!row.property_id) continue
    const list = byProperty.get(row.property_id) ?? []
    list.push(row)
    byProperty.set(row.property_id, list)
  }
  const activeMembers = new Map<string, number>()
  for (const member of (members ?? []) as Array<{ property_id: string; is_active: boolean }>) {
    if (member.is_active) activeMembers.set(member.property_id, (activeMembers.get(member.property_id) ?? 0) + 1)
  }

  const rows: PropertyOverviewRow[] = ((properties ?? []) as Array<Omit<PropertyOverviewRow, 'summary' | 'activeMembers'>>).map((property) => ({
    ...property,
    summary: summarize(byProperty.get(property.id) ?? []),
    activeMembers: activeMembers.get(property.id) ?? 0,
  }))

  return {
    properties: rows,
    events: (events ?? []).map((row) => toEvent(row as Record<string, unknown>)),
  }
}
