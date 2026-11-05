import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { requirePage, type Service } from '@/lib/authz/guard'
import { userPropertyIds, type MemberActor } from '@/lib/authz/actor'
import { can } from '@/lib/authz/permissions'
import { latestCosting } from '@/lib/costing'
import { loadCompanyFloors } from '@/lib/floors'
import { getPriorityOption } from '@/lib/priority'
import {
  matchesTenantFilter,
  tenantActionFor,
  type TenantRequestFilter,
  type TenantRequestListItem,
} from '@/lib/tenant-requests'
import { formatPHT } from '@/lib/utils'
import type { Floor, Priority, TenantCompany, WorkOrderStatus } from '@/types'

export {
  isAwaitingTenant,
  TENANT_REQUEST_TITLES,
  type TenantRequestFilter,
} from '@/lib/tenant-requests'

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
  /** Presence marks a legacy `svc_submitted` order that already has a sign-off link. */
  sign_off_token_hash: string | null
  audit_report_url: string | null
  cancellation_reason: string | null
  company_id?: string | null
  engineer_id?: string | null
  floors?: { label: string } | { label: string }[] | null
  work_order_reports: TenantRequestReport | TenantRequestReport[] | null
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
    .filter((row) => matchesTenantFilter(row, filter))
}

export async function getTenantServiceRequests(
  context: TenantPortalContext,
  filter: TenantRequestFilter = 'my-requests'
) {
  // Tenants see their company's requests (D10); unlinked tenants see none (D19)
  if (!context.actor.companyId) return []

  const { data, error } = await context.service
    .from('work_orders')
    .select(`
      id,
      property_id,
      company_id,
      floor_id,
      requested_by_id,
      wo_number,
      status,
      priority,
      type,
      created_at,
      updated_at,
      tenant_name,
      tenant_email,
      sign_off_token_hash,
      audit_report_url,
      cancellation_reason,
      floors(label),
      work_order_reports!work_order_reports_work_order_id_fkey(
        id, fault_description, location_notes, reported_by_name, reported_by_contact, tenant_lessee, urgency, photo_urls, created_at
      )
    `)
    .eq('property_id', context.property.id)
    .eq('company_id', context.actor.companyId)
    .eq('type', 'reactive')
    .order('created_at', { ascending: false })

  // A failed query (for example a column from a migration that has not been applied yet) must not look like "no reports"
  if (error) console.error('[tenant] failed to load service reports:', error.message)

  return filterTenantRequests((data ?? []) as unknown as TenantRequestRow[], context, filter)
}

/** Where a tenant reviews a request; requests waiting on them open the in-portal approval / sign-off page. */
export function getTenantApprovalHref(slug: string, row: Pick<TenantRequestRow, 'id' | 'status' | 'sign_off_token_hash'>) {
  const detail = `/${slug}/tenant/service-requests/${row.id}`
  return tenantActionFor(row) ? `${detail}/review` : detail
}

/** The plain list row for client components (drops the sign-off token hash and stored file URLs). */
export function toTenantRequestListItem(slug: string, row: TenantRequestRow): TenantRequestListItem {
  const report = rowsOf(row.work_order_reports)[0]
  const location = [rowsOf(row.floors)[0]?.label, report?.location_notes?.trim()].filter(Boolean).join(' · ')
  return {
    id: row.id,
    number: row.wo_number,
    description: report?.fault_description?.trim() || null,
    location: location || null,
    priority: getPriorityOption(report?.urgency ?? row.priority)?.label ?? null,
    status: row.status,
    submitted: formatPHT(row.created_at),
    href: getTenantApprovalHref(slug, row),
    action: tenantActionFor(row),
  }
}

/**
 * Latest estimate total per work order. `workOrderIds` must come from rows already scoped to the tenant
 * (`getTenantServiceRequests`).
 */
export async function getLatestEstimateTotals(context: TenantPortalContext, workOrderIds: string[]) {
  const totals = new Map<string, number>()
  if (workOrderIds.length === 0) return totals

  const { data, error } = await context.service
    .from('work_order_costings')
    .select('work_order_id, grand_total, submitted_at, created_at')
    .in('work_order_id', workOrderIds)
  if (error) {
    console.error('[tenant] failed to load estimate totals:', error.message)
    return totals
  }

  type CostingRow = { work_order_id: string; grand_total: number | string | null; submitted_at: string | null; created_at: string | null }
  const byOrder = new Map<string, CostingRow[]>()
  for (const row of (data ?? []) as CostingRow[]) {
    byOrder.set(row.work_order_id, [...(byOrder.get(row.work_order_id) ?? []), row])
  }
  for (const [id, rows] of byOrder) {
    const total = Number(latestCosting(rows)?.grand_total)
    if (Number.isFinite(total)) totals.set(id, total)
  }
  return totals
}

export interface TenantCompanyContext {
  company: TenantCompany
  floors: Floor[]
}

/** The tenant's company and its current floors, or null for tenants not linked to a company (D19). */
export async function getTenantCompany(context: TenantPortalContext): Promise<TenantCompanyContext | null> {
  const companyId = context.actor.companyId
  if (!companyId) return null

  const [{ data: company }, floors] = await Promise.all([
    context.service
      .from('tenant_companies')
      .select('*')
      .eq('id', companyId)
      .eq('property_id', context.property.id)
      .maybeSingle(),
    loadCompanyFloors(context.service, context.property.id, companyId),
  ])
  if (!company) return null
  return { company: company as TenantCompany, floors }
}

/** Props for the new service report modal: requests are filed for the tenant's company and one of its floors. */
export async function getTenantRequestModalProps(context: TenantPortalContext, slug: string) {
  const companyContext = await getTenantCompany(context)
  return {
    slug,
    defaultName: context.engineer.full_name,
    defaultContact: context.engineer.email || (context.user.email ?? ''),
    companyName: companyContext?.company.name,
    floors: (companyContext?.floors ?? []).map((floor) => ({ id: floor.id, label: floor.label })),
  }
}
