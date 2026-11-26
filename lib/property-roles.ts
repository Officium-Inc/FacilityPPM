import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PROPERTY_ROLE_COLUMNS,
  isAssignableRole,
  parsePropertyRole,
  sortRoles,
  type PropertyRole,
} from '@/lib/authz/property-role'
import type { SystemRoleKey } from '@/lib/authz/templates'

/**
 * Property roles and role-based member lists (D32, D33). Server-only; callers must have authorized the caller
 * for the property first (these use the service client).
 */

type Service = SupabaseClient

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

/** Every role of the property, Administrator first. */
export async function loadPropertyRoles(service: Service, propertyId: string): Promise<PropertyRole[]> {
  const { data } = await service.from('property_roles').select(PROPERTY_ROLE_COLUMNS).eq('property_id', propertyId)
  return sortRoles((data ?? []).map(parsePropertyRole).filter((role): role is PropertyRole => Boolean(role)))
}

/** One role, only when it belongs to the property. */
export async function loadRole(service: Service, propertyId: string, roleId: unknown): Promise<PropertyRole | null> {
  if (!isUuid(roleId)) return null
  const { data } = await service
    .from('property_roles')
    .select(PROPERTY_ROLE_COLUMNS)
    .eq('id', roleId)
    .eq('property_id', propertyId)
    .maybeSingle()
  const role = parsePropertyRole(data)
  return role && role.propertyId === propertyId ? role : null
}

/** The id of a default role of the property (Administrator: always present). */
export async function systemRoleId(service: Service, propertyId: string, key: SystemRoleKey): Promise<string | null> {
  const { data } = await service
    .from('property_roles')
    .select('id')
    .eq('property_id', propertyId)
    .eq('system_key', key)
    .maybeSingle()
  return (data?.id as string | undefined) ?? null
}

export interface MemberOption {
  id: string
  full_name: string
  email: string
  company_id: string | null
}

interface MemberRoleRow {
  id: string
  full_name: string | null
  email: string | null
  company_id: string | null
  property_role: unknown
}

async function loadActiveMembersWithRoles(service: Service, propertyId: string) {
  const { data } = await service
    .from('engineers')
    .select(`id, full_name, email, company_id, property_role:property_roles(${PROPERTY_ROLE_COLUMNS})`)
    .eq('property_id', propertyId)
    .eq('is_active', true)
    .order('full_name')
  return ((data ?? []) as unknown as MemberRoleRow[]).map((row) => ({ row, role: parsePropertyRole(row.property_role) }))
}

function toOption(row: MemberRoleRow): MemberOption {
  return { id: row.id, full_name: row.full_name || row.email || 'Unknown', email: row.email ?? '', company_id: row.company_id ?? null }
}

/**
 * Members who can be picked for work (D33): active members whose role has the Service Group work type and holds
 * `permission` (inspect for the inspection, execute for doing the work). Office roles, engineers and the
 * Administrator role (including Org Admins) are never listed.
 */
export async function loadAssignableMembers(
  service: Service,
  propertyId: string,
  permission: 'workRequest.inspect' | 'workRequest.execute'
): Promise<MemberOption[]> {
  const members = await loadActiveMembersWithRoles(service, propertyId)
  return members.filter(({ role }) => isAssignableRole(role, permission)).map(({ row }) => toOption(row))
}

/** Server-side check of a picked assignee: the same rule as `loadAssignableMembers`. */
export async function isEligibleAssignee(
  service: Service,
  propertyId: string,
  engineerId: unknown,
  permission: 'workRequest.inspect' | 'workRequest.execute'
): Promise<boolean> {
  if (!isUuid(engineerId)) return false
  const { data } = await service
    .from('engineers')
    .select(`id, is_active, property_role:property_roles(${PROPERTY_ROLE_COLUMNS})`)
    .eq('id', engineerId)
    .eq('property_id', propertyId)
    .eq('is_active', true)
    .maybeSingle()
  return Boolean(data) && isAssignableRole(parsePropertyRole(data?.property_role), permission)
}

/**
 * Tenant-portal members who may approve estimates and sign off for a work order: members of its company, or every
 * tenant-portal member when the work order has no company.
 */
export async function loadTenantApprovers(service: Service, propertyId: string, companyId: string | null): Promise<MemberOption[]> {
  const members = await loadActiveMembersWithRoles(service, propertyId)
  return members
    .filter(({ row, role }) => role?.portal === 'tenant' && role.permissions['workRequest.approve'] && (!companyId || row.company_id === companyId))
    .map(({ row }) => toOption(row))
}

/** Active members holding the Administrator role (org-managed rows included), optionally excluding one member. */
export async function countActiveAdministrators(service: Service, propertyId: string, excludeEngineerId?: string): Promise<number> {
  const adminRoleId = await systemRoleId(service, propertyId, 'admin')
  if (!adminRoleId) return 0
  let query = service
    .from('engineers')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId)
    .eq('property_role_id', adminRoleId)
    .eq('is_active', true)
  if (excludeEngineerId) query = query.neq('id', excludeEngineerId)
  const { count } = await query
  return count ?? 0
}

/** Audit entry for a role change (`role.created` / `role.updated` / `role.deleted`). Never throws. */
export async function logRoleChange(
  service: Service,
  entry: { propertyId: string; userId: string; actorRole: string; action: string; roleId: string; metadata: Record<string, unknown> }
) {
  const { error } = await service.from('audit_log').insert({
    property_id: entry.propertyId,
    user_id: entry.userId,
    action: entry.action,
    entity_type: 'property_role',
    entity_id: entry.roleId,
    metadata: { ...entry.metadata, actor_role: entry.actorRole },
  })
  if (error) console.error('[roles] failed to write audit log:', error.message)
}

/** Members and pending invitations per role (a role in use cannot be deleted). */
export async function roleUsage(service: Service, propertyId: string) {
  const [{ data: members }, { data: invitations }] = await Promise.all([
    service.from('engineers').select('property_role_id').eq('property_id', propertyId).not('property_role_id', 'is', null),
    service
      .from('invitations')
      .select('property_role_id')
      .eq('property_id', propertyId)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .not('property_role_id', 'is', null),
  ])
  const usage = new Map<string, { members: number; invitations: number }>()
  const bump = (roleId: string, field: 'members' | 'invitations') => {
    const entry = usage.get(roleId) ?? { members: 0, invitations: 0 }
    entry[field]++
    usage.set(roleId, entry)
  }
  for (const row of (members ?? []) as Array<{ property_role_id: string }>) bump(row.property_role_id, 'members')
  for (const row of (invitations ?? []) as Array<{ property_role_id: string }>) bump(row.property_role_id, 'invitations')
  return usage
}
