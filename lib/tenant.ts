import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { requirePage, type Service } from '@/lib/authz/guard'
import { userPropertyIds, type MemberActor } from '@/lib/authz/actor'
import { can } from '@/lib/authz/permissions'
import type { Priority, WorkOrderStatus } from '@/types'

export type TenantRequestFilter =
  | 'my-requests'
  | 'pending'
  | 'for-my-approval'
  | 'complete'
  | 'cancelled'

export interface TenantProperty {
  id: string
  name: string
  slug: string
  license_status: string
}

export interface TenantEngineer {
  id: string
  full_name: string
  email: string
  is_active: boolean
}

export interface TenantPortalContext {
  user: User
  actor: MemberActor
  property: TenantProperty
  engineer: TenantEngineer
  role: string
  userProperties: Array<{ id: string; name: string; slug: string }>
  service: Service
}

export interface TenantRequestReport {
  id: string
  fault_description: string
  location_notes: string | null
  reported_by_name: string
  reported_by_contact: string | null
  tenant_lessee: string | null
  urgency: Priority | null
  photo_urls: string[] | null
  created_at: string
}

export interface TenantRequestRow {
  id: string
  property_id: string | null
  requested_by_id: string | null
  wo_number: string
  status: WorkOrderStatus
  priority: Priority | null
  type: string
  created_at: string
  updated_at: string
  tenant_name: string | null
  tenant_email: string | null
  costing_token: string | null
  sign_off_token: string | null
  audit_report_url: string | null
  cancellation_reason: string | null
  company_id?: string | null
  engineer_id?: string | null
  work_order_reports: TenantRequestReport | TenantRequestReport[] | null
}

/**
 * Flow: ... in_progress -> svc_submitted (final verification by the head engineer)
 * -> verified (waiting for the tenant to sign off) -> completed.
 * `signed` is the legacy "tenant signed, not yet verified" state.
 * A legacy svc_submitted order that already has a sign-off link is still waiting on the tenant.
 */
export function isAwaitingTenant(row: Pick<TenantRequestRow, 'status' | 'sign_off_token'>) {
  return (
    row.status === 'pending_approval' ||
    row.status === 'verified' ||
    (row.status === 'svc_submitted' && Boolean(row.sign_off_token))
  )
}

const STATUS_GROUPS: Record<'pending' | 'complete' | 'cancelled', WorkOrderStatus[]> = {
  pending: ['new_report', 'inspecting', 'costing', 'assigned', 'in_progress', 'svc_submitted'],
  complete: ['signed', 'completed'],
  cancelled: ['cancelled'],
}

export const TENANT_REQUEST_TITLES: Record<TenantRequestFilter, string> = {
  'my-requests': 'My Reports',
  pending: 'Pending',
  'for-my-approval': 'For My Approval',
  complete: 'Complete',
  cancelled: 'Cancelled',
}

export function rowsOf<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

/**
 * Tenant Portal guard and context (per request). Only active tenant members of the property get in;
 * staff are sent to the Admin Portal, others signed out.
 */
export const getTenantPortalContext = cache(async (slug: string): Promise<TenantPortalContext> => {
  const { user, service, property, actor } = await requirePage(slug, 'portal.tenant')
  if (actor.kind !== 'member') redirect(`/${slug}`)

  if (user.app_metadata?.property_slug !== slug) {
    await service.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...user.app_metadata,
        property_id: property.id,
        property_slug: slug,
      },
    })
  }

  const propertyIds = userPropertyIds(user)
  const { data: userProperties } = propertyIds.length > 0
    ? await service.from('properties').select('id, name, slug').in('id', propertyIds)
    : { data: [] }

  return {
    user,
    actor,
    property: property as TenantProperty,
    engineer: { id: actor.engineerId, full_name: actor.name, email: actor.email ?? '', is_active: true },
    role: actor.role,
    userProperties: userProperties ?? [],
    service,
  }
})

export function isTenantOwnedRequest(row: TenantRequestRow, context: TenantPortalContext) {
  const report = rowsOf(row.work_order_reports)[0]
  return can(context.actor, 'workRequest.view', {
    property_id: row.property_id,
    requested_by_id: row.requested_by_id,
    tenant_email: row.tenant_email,
    reported_by_contact: report?.reported_by_contact,
    company_id: row.company_id ?? null,
  })
}

export function filterTenantRequests(
  rows: TenantRequestRow[],
  context: TenantPortalContext,
  filter: TenantRequestFilter
) {
  return rows
    .filter((row) => isTenantOwnedRequest(row, context))
    .filter((row) => {
      if (filter === 'my-requests') return true
      if (filter === 'for-my-approval') return isAwaitingTenant(row)
      if (filter === 'pending') return STATUS_GROUPS.pending.includes(row.status) && !isAwaitingTenant(row)
      return STATUS_GROUPS[filter].includes(row.status)
    })
}

export async function getTenantServiceRequests(
  context: TenantPortalContext,
  filter: TenantRequestFilter = 'my-requests'
) {
  const { data, error } = await context.service
    .from('work_orders')
    .select(`
      id,
      property_id,
      requested_by_id,
      wo_number,
      status,
      priority,
      type,
      created_at,
      updated_at,
      tenant_name,
      tenant_email,
      costing_token,
      sign_off_token,
      audit_report_url,
      cancellation_reason,
      work_order_reports!work_order_reports_work_order_id_fkey(
        id, fault_description, location_notes, reported_by_name, reported_by_contact, tenant_lessee, urgency, photo_urls, created_at
      )
    `)
    .eq('property_id', context.property.id)
    .eq('type', 'reactive')
    .order('created_at', { ascending: false })

  // A failed query (for example a column from a migration that has not been applied yet) must not look like "no reports"
  if (error) console.error('[tenant] failed to load service reports:', error.message)

  return filterTenantRequests((data ?? []) as unknown as TenantRequestRow[], context, filter)
}

export function getTenantApprovalHref(slug: string, row: TenantRequestRow) {
  if (row.status === 'pending_approval' && row.costing_token) {
    return `/costing-approval/${row.costing_token}`
  }
  if ((row.status === 'verified' || row.status === 'svc_submitted') && row.sign_off_token) {
    return `/sign-off/${row.sign_off_token}`
  }
  return `/${slug}/tenant/service-requests/${row.id}`
}
