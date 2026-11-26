/**
 * The permission catalog (D32): every permission a property role can be granted. Pure and client-safe.
 *
 * Mirrored in SQL by `permission_keys` (supabase/migrations/026_property_roles.sql, block CATALOG:BEGIN/END);
 * tests/authz/catalog.test.ts keeps the two in sync. A new module needs: a key here, a row in a new migration's
 * `permission_keys` upsert (the Administrator role gets it automatically) and a matching test update.
 */

/** How far a permission reaches inside its property. */
export type Scope =
  | 'property' // any record of the property
  | 'assigned' // work orders assigned to the member (work_orders.engineer_id)
  | 'company' // records of the tenant's own company

export type Portal = 'staff' | 'tenant'

/** Scopes each portal may use: staff work on the property or their assigned work, tenants on their company. */
export const PORTAL_SCOPES: Record<Portal, readonly Scope[]> = {
  staff: ['property', 'assigned'],
  tenant: ['company'],
}

export interface PermissionDefinition {
  module: ModuleKey
  label: string
  description: string
  portals: readonly Portal[]
  scopes: readonly Scope[]
  /** Platform Admin's read-only support view (D2) is allowed this permission inside a property. */
  provider: boolean
  /** Granting this permission also grants these, at the same scope when it is allowed there. */
  implies?: readonly PermissionKey[]
}

export const MODULES = [
  { key: 'work_requests', label: 'Work requests' },
  { key: 'structure', label: 'Floors & tenants' },
  { key: 'maintenance', label: 'Maintenance (assets, schedules, reports)' },
  { key: 'people', label: 'Members & roles' },
  { key: 'property', label: 'Property settings' },
] as const

export type ModuleKey = (typeof MODULES)[number]['key']

const CATALOG = {
  // Work requests
  'workRequest.view': {
    module: 'work_requests', label: 'View work requests', description: 'See work requests and their history',
    portals: ['staff', 'tenant'], scopes: ['property', 'assigned', 'company'], provider: true,
  },
  'workRequest.submit': {
    module: 'work_requests', label: 'Submit requests', description: 'Report an issue for their own company',
    portals: ['tenant'], scopes: ['company'], provider: false, implies: ['workRequest.view'],
  },
  'workRequest.submitOnBehalf': {
    module: 'work_requests', label: 'Report on behalf of a tenant', description: 'Record a service report for a tenant company',
    portals: ['staff'], scopes: ['property'], provider: false, implies: ['workRequest.view'],
  },
  'workRequest.review': {
    module: 'work_requests', label: 'Review, cost and verify', description: 'Start inspections, prepare estimates, verify finished work, send sign-off links',
    portals: ['staff'], scopes: ['property'], provider: false, implies: ['workRequest.view'],
  },
  'workRequest.inspect': {
    module: 'work_requests', label: 'Record inspections', description: 'Record inspection findings',
    portals: ['staff'], scopes: ['property', 'assigned'], provider: false, implies: ['workRequest.view'],
  },
  'workRequest.assign': {
    module: 'work_requests', label: 'Assign work', description: 'Assign approved work to a Service Group member',
    portals: ['staff'], scopes: ['property'], provider: false, implies: ['workRequest.view'],
  },
  'workRequest.execute': {
    module: 'work_requests', label: 'Do the work', description: 'Upload evidence and submit completed work',
    portals: ['staff'], scopes: ['property', 'assigned'], provider: false, implies: ['workRequest.view'],
  },
  'workRequest.cancel': {
    module: 'work_requests', label: 'Cancel requests', description: 'Cancel a request (tenants only before inspection starts)',
    portals: ['staff', 'tenant'], scopes: ['property', 'company'], provider: false, implies: ['workRequest.view'],
  },
  'workRequest.approve': {
    module: 'work_requests', label: 'Approve estimates and sign off', description: 'Approve cost estimates and sign off finished work',
    portals: ['tenant'], scopes: ['company'], provider: false, implies: ['workRequest.view'],
  },
  'workRequest.comment': {
    module: 'work_requests', label: 'Comment', description: 'Post comments and mention people',
    portals: ['staff', 'tenant'], scopes: ['property', 'assigned', 'company'], provider: false, implies: ['workRequest.view'],
  },
  'workRequest.waivedList': {
    module: 'work_requests', label: 'View waived orders', description: 'See the list of work orders with waived charges',
    portals: ['staff'], scopes: ['property'], provider: true,
  },
  'workRequest.waive': {
    module: 'work_requests', label: 'Waive charges', description: 'Waive or restore the charges of a work order',
    portals: ['staff'], scopes: ['property'], provider: false, implies: ['workRequest.view', 'workRequest.waivedList'],
  },

  // Floors & tenants
  'floors.view': {
    module: 'structure', label: 'View floors & tenants', description: 'See floors, tenant companies and tenant users',
    portals: ['staff'], scopes: ['property'], provider: true,
  },
  'floors.manage': {
    module: 'structure', label: 'Manage floors', description: 'Add, edit and remove floors and assign them to companies',
    portals: ['staff'], scopes: ['property'], provider: false, implies: ['floors.view'],
  },
  'companies.manage': {
    module: 'structure', label: 'Manage tenant companies', description: 'Add companies and link tenant users to them',
    portals: ['staff'], scopes: ['property'], provider: false, implies: ['floors.view'],
  },

  // Maintenance
  'maintenance.view': {
    module: 'maintenance', label: 'View maintenance', description: 'See assets, PPM schedules and reports',
    portals: ['staff'], scopes: ['property'], provider: true,
  },
  'maintenance.manage': {
    module: 'maintenance', label: 'Manage maintenance', description: 'Add assets and create planned (PPM) work orders',
    portals: ['staff'], scopes: ['property'], provider: false, implies: ['maintenance.view'],
  },

  // Members & roles
  'members.view': {
    module: 'people', label: 'View members', description: 'See the property’s members',
    portals: ['staff'], scopes: ['property'], provider: true,
  },
  'members.manage': {
    module: 'people', label: 'Manage members', description: 'Invite, edit and remove members (only roles with less access than their own)',
    portals: ['staff'], scopes: ['property'], provider: false, implies: ['members.view'],
  },
  'roles.manage': {
    module: 'people', label: 'Manage roles', description: 'Create and edit roles (only with less access than their own)',
    portals: ['staff'], scopes: ['property'], provider: false, implies: ['members.view'],
  },
  'audit.view': {
    module: 'people', label: 'View audit log', description: 'Read the property’s audit log',
    portals: ['staff'], scopes: ['property'], provider: true,
  },

  // Property settings
  'property.profile.edit': {
    module: 'property', label: 'Edit property profile', description: 'Edit the company profile and work order terms',
    portals: ['staff'], scopes: ['property'], provider: false,
  },
  'property.integrations.manage': {
    module: 'property', label: 'Manage integrations', description: 'Connect Monday.com and manage API keys',
    portals: ['staff'], scopes: ['property'], provider: false,
  },
} as const satisfies Record<string, Omit<PermissionDefinition, 'implies'> & { implies?: readonly string[] }>

export type PermissionKey = keyof typeof CATALOG

export const PERMISSION_CATALOG = CATALOG as unknown as Record<PermissionKey, PermissionDefinition>

export const PERMISSION_KEYS = Object.keys(CATALOG) as PermissionKey[]

/** Keys that can exist on staff roles: the locked Administrator role holds all of them at property scope. */
export const STAFF_PERMISSION_KEYS = PERMISSION_KEYS.filter((key) => PERMISSION_CATALOG[key].portals.includes('staff'))

/** Actions checked by `can()` that are not grantable: portal access comes from the role's portal. */
export const PORTAL_ACTIONS = ['portal.admin', 'portal.tenant', 'provider.manage'] as const
export type PortalAction = (typeof PORTAL_ACTIONS)[number]

export type Action = PermissionKey | PortalAction

/** A role's grants: permission key → scope. */
export type Permissions = Partial<Record<PermissionKey, Scope>>

export function isPermissionKey(value: unknown): value is PermissionKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CATALOG, value)
}

export function isPortal(value: unknown): value is Portal {
  return value === 'staff' || value === 'tenant'
}

/** Scopes `key` allows for a role of `portal`. Empty when the key does not exist for that portal. */
export function scopesFor(key: PermissionKey, portal: Portal): Scope[] {
  const definition = PERMISSION_CATALOG[key]
  if (!definition.portals.includes(portal)) return []
  return definition.scopes.filter((scope) => PORTAL_SCOPES[portal].includes(scope))
}

/** Whether `scope` reaches at least as far as `other`: property covers assigned; equal scopes cover each other. */
export function scopeCovers(scope: Scope, other: Scope) {
  return scope === other || (scope === 'property' && other === 'assigned')
}

/** The widest scope `key` allows for `portal` that `scope` covers, so implied grants never reach further. */
function impliedScope(key: PermissionKey, portal: Portal, scope: Scope): Scope | null {
  const allowed = scopesFor(key, portal)
  if (allowed.includes(scope)) return scope
  // e.g. a property-only key implied by an assigned-scope grant is not granted (it would widen access)
  return allowed.find((candidate) => scopeCovers(scope, candidate)) ?? null
}

/**
 * Cleans a role's grants for `portal`: drops unknown keys and scopes the key or portal does not allow, then adds
 * implied grants (keeping the wider scope when one is already granted). Fails closed on anything malformed.
 */
export function normalizePermissions(input: unknown, portal: Portal): Permissions {
  const result: Permissions = {}
  if (!input || typeof input !== 'object') return result

  for (const [key, scope] of Object.entries(input as Record<string, unknown>)) {
    if (!isPermissionKey(key) || typeof scope !== 'string') continue
    if (!scopesFor(key, portal).includes(scope as Scope)) continue
    result[key] = scope as Scope
  }

  // Implied grants (one level is enough today; loop until stable to be safe)
  let changed = true
  while (changed) {
    changed = false
    for (const key of Object.keys(result) as PermissionKey[]) {
      const scope = result[key] as Scope
      for (const implied of PERMISSION_CATALOG[key].implies ?? []) {
        const target = impliedScope(implied, portal, scope)
        if (!target) continue
        const current = result[implied]
        if (!current || (current !== target && scopeCovers(target, current))) {
          result[implied] = target
          changed = true
        }
      }
    }
  }
  return result
}

/** Every staff key at property scope: the locked Administrator role (computed, never stored). */
export function administratorPermissions(): Permissions {
  return Object.fromEntries(STAFF_PERMISSION_KEYS.map((key) => [key, 'property'])) as Permissions
}

/** Permissions as a stable list (for storage and comparison). */
export function permissionEntries(permissions: Permissions): Array<{ key: PermissionKey; scope: Scope }> {
  return PERMISSION_KEYS.filter((key) => permissions[key]).map((key) => ({ key, scope: permissions[key] as Scope }))
}
