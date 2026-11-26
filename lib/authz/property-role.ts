/**
 * Property roles as the app sees them (D32, D33). Pure and client-safe: parses `property_roles` rows (with their
 * `property_role_permissions`) into roles with EFFECTIVE permissions, failing closed on anything malformed.
 */
import { isPortal, type Permissions, type Portal } from './catalog'
import { grantsFromRows, rolePermissions } from './permissions'
import { isSystemRoleKey, isWorkType, type SystemRoleKey, type WorkType } from './templates'

export interface PropertyRole {
  id: string
  propertyId: string
  name: string
  description: string | null
  portal: Portal
  workType: WorkType
  systemKey: SystemRoleKey | null
  /** The Administrator role: every staff permission, cannot be edited or deleted. */
  isLocked: boolean
  /** Effective permissions (computed for the Administrator role). */
  permissions: Permissions
  updatedAt: string | null
}

/** Columns to select for `parsePropertyRole` (also usable inside an embed: `property_role:property_roles(…)`). */
export const PROPERTY_ROLE_COLUMNS =
  'id, property_id, name, description, portal, work_type, system_key, is_locked, updated_at, property_role_permissions(permission_key, scope)'

export function parsePropertyRole(value: unknown): PropertyRole | null {
  const row = (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | null | undefined
  if (!row || typeof row.id !== 'string' || typeof row.name !== 'string' || !isPortal(row.portal)) return null
  const isLocked = row.is_locked === true
  const portal = row.portal
  return {
    id: row.id,
    propertyId: typeof row.property_id === 'string' ? row.property_id : '',
    name: row.name,
    description: typeof row.description === 'string' ? row.description : null,
    portal,
    // Tenant roles never do field work; an unknown work type is treated as none (fail closed for assignment)
    workType: portal === 'staff' && isWorkType(row.work_type) ? row.work_type : 'none',
    systemKey: isSystemRoleKey(row.system_key) ? row.system_key : null,
    isLocked,
    permissions: rolePermissions({ portal, locked: isLocked, permissions: grantsFromRows(row.property_role_permissions) }),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  }
}

/** Administrator first, then the other default roles in template order, then custom roles by name. */
export function sortRoles<T extends Pick<PropertyRole, 'systemKey' | 'name' | 'portal'>>(roles: T[]): T[] {
  const order = ['admin', 'property_manager', 'head_engineer', 'service_group', 'tenant']
  return [...roles].sort((a, b) => {
    const ai = a.systemKey ? order.indexOf(a.systemKey) : order.length + (a.portal === 'tenant' ? 1 : 0)
    const bi = b.systemKey ? order.indexOf(b.systemKey) : order.length + (b.portal === 'tenant' ? 1 : 0)
    return ai - bi || a.name.localeCompare(b.name)
  })
}

/** Whether a member with this role can be picked for work: a Service Group role that holds `permission` (D33). */
export function isAssignableRole(
  role: Pick<PropertyRole, 'portal' | 'workType' | 'permissions'> | null | undefined,
  permission: 'workRequest.inspect' | 'workRequest.execute'
) {
  return Boolean(role && role.portal === 'staff' && role.workType === 'service_group' && role.permissions[permission])
}
