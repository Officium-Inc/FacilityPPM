import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { normalizeRoleName } from '@/lib/roles'
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
  property: TenantProperty
  engineer: TenantEngineer
  role: string
  userProperties: Array<{ id: string; name: string; slug: string }>
  service: Awaited<ReturnType<typeof createServiceClient>>
}

export interface TenantRequestReport {
  id: string
  fault_description: string
  location_notes: string | null
  reported_by_name: string
  reported_by_contact: string | null
  urgency: Priority
  created_at: string
}

export interface TenantRequestRow {
  id: string
  property_id: string | null
  requested_by_id: string | null
  wo_number: string
  status: WorkOrderStatus
  priority: Priority
  type: string
  created_at: string
  updated_at: string
  tenant_name: string | null
  tenant_email: string | null
  costing_token: string | null
  sign_off_token: string | null
  work_order_reports: TenantRequestReport | TenantRequestReport[] | null
}

const STATUS_GROUPS: Record<Exclude<TenantRequestFilter, 'my-requests'>, WorkOrderStatus[]> = {
  pending: ['new_report', 'inspecting', 'costing', 'assigned', 'in_progress'],
  'for-my-approval': ['pending_approval', 'svc_submitted'],
  complete: ['signed', 'verified', 'completed'],
  cancelled: ['cancelled'],
}

export const TENANT_REQUEST_TITLES: Record<TenantRequestFilter, string> = {
  'my-requests': 'My Requests',
  pending: 'Pending',
  'for-my-approval': 'For My Approval',
  complete: 'Complete',
  cancelled: 'Cancelled',
}

export function rowsOf<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function roleNameFromRelation(roles: unknown) {
  if (!roles) return ''
  if (Array.isArray(roles)) {
    return normalizeRoleName((roles[0] as { name?: string } | undefined)?.name)
  }
  return normalizeRoleName((roles as { name?: string } | null)?.name)
}

export async function getTenantPortalContext(slug: string): Promise<TenantPortalContext> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = await createServiceClient()
  const { data: property } = await service
    .from('properties')
    .select('id, name, slug, license_status')
    .eq('slug', slug)
    .single()

  if (!property || property.license_status === 'suspended') {
    redirect(`/${slug}/suspended`)
  }

  if (user.app_metadata?.property_slug !== slug) {
    await service.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...user.app_metadata,
        property_id: property.id,
        property_slug: slug,
      },
    })
  }

  const { data: engineer } = await service
    .from('engineers')
    .select('id, full_name, email, is_active, roles(name)')
    .eq('property_id', property.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (engineer && engineer.is_active === false) {
    redirect('/api/auth/sign-out?next=/login?reason=deactivated')
  }

  const role = roleNameFromRelation(engineer?.roles)
  if (!engineer || role !== 'tenant') {
    redirect(`/${slug}`)
  }

  const propertyIds: string[] = (user.app_metadata?.property_ids as string[] | undefined) ??
    (user.app_metadata?.property_id ? [user.app_metadata.property_id as string] : [])

  const { data: userProperties } = propertyIds.length > 0
    ? await service.from('properties').select('id, name, slug').in('id', propertyIds)
    : { data: [] }

  return {
    user,
    property: property as TenantProperty,
    engineer: engineer as TenantEngineer,
    role,
    userProperties: userProperties ?? [],
    service,
  }
}

export function isTenantOwnedRequest(row: TenantRequestRow, context: TenantPortalContext) {
  if (row.requested_by_id) return row.requested_by_id === context.engineer.id

  const email = (context.engineer.email || context.user.email || '').trim().toLowerCase()
  if (!email) return false

  if (row.tenant_email?.trim().toLowerCase() === email) return true

  const report = rowsOf(row.work_order_reports)[0]
  const contact = report?.reported_by_contact?.trim().toLowerCase() ?? ''
  return contact.includes(email)
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
      return STATUS_GROUPS[filter].includes(row.status)
    })
}

export async function getTenantServiceRequests(
  context: TenantPortalContext,
  filter: TenantRequestFilter = 'my-requests'
) {
  const { data } = await context.service
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
      work_order_reports!work_order_reports_work_order_id_fkey(
        id, fault_description, location_notes, reported_by_name, reported_by_contact, urgency, created_at
      )
    `)
    .eq('property_id', context.property.id)
    .eq('type', 'reactive')
    .order('created_at', { ascending: false })

  return filterTenantRequests((data ?? []) as unknown as TenantRequestRow[], context, filter)
}

export function getTenantApprovalHref(slug: string, row: TenantRequestRow) {
  if (row.status === 'pending_approval' && row.costing_token) {
    return `/costing-approval/${row.costing_token}`
  }
  if (row.status === 'svc_submitted' && row.sign_off_token) {
    return `/sign-off/${row.sign_off_token}`
  }
  return `/${slug}/tenant/service-requests/${row.id}`
}
