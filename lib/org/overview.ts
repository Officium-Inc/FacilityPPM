import type { SupabaseClient } from '@supabase/supabase-js'
import { effectiveLicenseState, type LicenseState } from '@/lib/provider/license'
import { getTerminatedPropertyIds } from '@/lib/provider/account-status'
import type { AuditEntry } from '@/lib/provider/activity'

/**
 * Read-only organization data for the Platform Admin organization page and the org portal. Callers must have
 * passed `requireProviderPage()` or `requireOrgPage()` for this organization.
 */

type Service = SupabaseClient

/** Whether an embedded `property_role:property_roles(is_locked)` is the locked Administrator role. */
function holdsAdministratorRole(value: unknown) {
  const row = (Array.isArray(value) ? value[0] : value) as { is_locked?: boolean } | null | undefined
  return row?.is_locked === true
}

const OPEN_STATUSES = new Set(['new_report', 'inspecting', 'costing', 'assigned', 'in_progress', 'svc_submitted', 'scheduled', 'on_hold', 'overdue'])

export interface OrgPropertyRow {
  id: string
  name: string
  slug: string
  property_type: string
  license: LicenseState
  terminated: boolean
  activeMembers: number
  activeAdministrators: number
  openWorkOrders: number
  created_at: string
}

export interface OrgMemberView {
  id: string
  user_id: string
  email: string
  full_name: string
  org_role: string
  is_active: boolean
  created_at: string
}

export interface OrgInvitationView {
  id: string
  email: string
  invited_name: string | null
  org_role: string
  expires_at: string
  used_at: string | null
  created_at: string
}

/** The organization's properties with their effective license, members, Administrators and open work orders. */
export async function loadOrganizationProperties(
  service: Service,
  organization: { id: string; license_status: string; license_expires_at?: string | null }
): Promise<OrgPropertyRow[]> {
  const { data: properties } = await service
    .from('properties')
    .select('id, name, slug, property_type, license_status, license_expires_at, created_at')
    .eq('organization_id', organization.id)
    .order('name')
  const rows = (properties ?? []) as Array<{
    id: string; name: string; slug: string; property_type: string
    license_status: string; license_expires_at: string | null; created_at: string
  }>
  if (rows.length === 0) return []

  const ids = rows.map((row) => row.id)
  const [{ data: members }, { data: workOrders }, terminated] = await Promise.all([
    service.from('engineers').select('property_id, is_active, property_role:property_roles(is_locked)').in('property_id', ids),
    service.from('work_orders').select('property_id, status').in('property_id', ids),
    getTerminatedPropertyIds(service),
  ])

  const count = <T,>(list: T[] | null, keyOf: (item: T) => string | null, keep: (item: T) => boolean) => {
    const counts = new Map<string, number>()
    for (const item of list ?? []) {
      const key = keyOf(item)
      if (key && keep(item)) counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }
  type MemberRow = { property_id: string; is_active: boolean; property_role: unknown }
  const activeMembers = count(members as MemberRow[] | null, (m) => m.property_id, (m) => m.is_active)
  const activeAdmins = count(members as MemberRow[] | null, (m) => m.property_id, (m) => m.is_active && holdsAdministratorRole(m.property_role))
  const open = count(
    workOrders as Array<{ property_id: string | null; status: string }> | null,
    (w) => w.property_id,
    (w) => OPEN_STATUSES.has(w.status)
  )

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    property_type: row.property_type,
    license: effectiveLicenseState(organization, row),
    terminated: terminated.has(row.id),
    activeMembers: activeMembers.get(row.id) ?? 0,
    activeAdministrators: activeAdmins.get(row.id) ?? 0,
    openWorkOrders: open.get(row.id) ?? 0,
    created_at: row.created_at,
  }))
}

/** Org Admins and their pending (unused) invitations. */
export async function loadOrganizationMembers(service: Service, organizationId: string) {
  const [{ data: members }, { data: invitations }] = await Promise.all([
    service
      .from('organization_members')
      .select('id, user_id, email, full_name, org_role, is_active, created_at')
      .eq('organization_id', organizationId)
      .order('created_at'),
    service
      .from('organization_invitations')
      .select('id, email, invited_name, org_role, expires_at, used_at, created_at')
      .eq('organization_id', organizationId)
      .is('used_at', null)
      .order('created_at', { ascending: false }),
  ])
  return {
    members: (members ?? []) as OrgMemberView[],
    invitations: (invitations ?? []) as OrgInvitationView[],
  }
}

/** The organization's audit entries (license, termination, Org Admins, properties created). */
export async function loadOrganizationAudit(service: Service, organizationId: string, limit = 50): Promise<AuditEntry[]> {
  const { data } = await service
    .from('audit_log')
    .select('id, action, entity_type, metadata, created_at, user_id')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as AuditEntry[]
}
