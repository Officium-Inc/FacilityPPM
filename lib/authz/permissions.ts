/**
 * Permission checks (D32). A member's permissions come from their property role (`property_roles` +
 * `property_role_permissions`); the catalog of keys is lib/authz/catalog.ts and the default roles are
 * lib/authz/templates.ts. Human-readable rules: .github/skills/facilityppm-tenant-isolation/references/portal-role-matrix.md.
 *
 * Pure (no server imports) so client components can use `can()` to show or hide controls.
 * Hiding a control is only UX; server routes and pages enforce the same rules with lib/authz/guard.ts.
 */
import {
  PERMISSION_CATALOG,
  administratorPermissions,
  isPermissionKey,
  normalizePermissions,
  type Action,
  type Permissions,
  type Portal,
  type Scope,
} from './catalog'
import type { WorkType } from './templates'

export type { Action, PermissionKey, Permissions, Portal, Scope } from './catalog'

export type ProviderActorLike = { kind: 'provider' }

export type MemberActorLike = {
  kind: 'member'
  portal: Portal
  /** Effective permissions (computed for the locked Administrator role). */
  permissions: Permissions
  /** Holds the locked Administrator role (exempt from the escalation rules). */
  isAdministrator?: boolean
  roleId?: string
  propertyId?: string
  engineerId?: string
  companyId?: string | null
  email?: string | null
}

export type ActorLike = ProviderActorLike | MemberActorLike

/** The record fields used for scoping. Work orders select these columns before authorizing. */
export interface ScopedRecord {
  property_id: string | null
  engineer_id?: string | null
  company_id?: string | null
  requested_by_id?: string | null
  tenant_email?: string | null
  reported_by_contact?: string | null
}

/** A role as stored: portal, lock and its raw grants. */
export interface RoleGrants {
  portal: Portal
  locked: boolean
  permissions: unknown
}

/**
 * Effective permissions of a role: every staff permission for the locked Administrator role, otherwise the
 * stored grants cleaned for the role's portal (unknown keys and wrong scopes dropped: fail closed).
 */
export function rolePermissions(role: RoleGrants): Permissions {
  if (role.locked && role.portal === 'staff') return administratorPermissions()
  return normalizePermissions(role.permissions, role.portal)
}

/** Grants from `property_role_permissions` rows. */
export function grantsFromRows(rows: unknown): Record<string, string> {
  const grants: Record<string, string> = {}
  if (!Array.isArray(rows)) return grants
  for (const row of rows as Array<{ permission_key?: unknown; scope?: unknown }>) {
    if (typeof row?.permission_key === 'string' && typeof row.scope === 'string') grants[row.permission_key] = row.scope
  }
  return grants
}

/** Platform Admin inside a property: the read-only support view (D2). */
function providerCan(action: Action) {
  if (action === 'portal.admin' || action === 'provider.manage') return true
  if (action === 'portal.tenant') return false
  return isPermissionKey(action) ? PERMISSION_CATALOG[action].provider : false
}

function memberScope(actor: MemberActorLike, action: Action): Scope | null {
  // Portal access comes from the role's portal, not from a grant
  if (action === 'portal.admin') return actor.portal === 'staff' ? 'property' : null
  if (action === 'portal.tenant') return actor.portal === 'tenant' ? 'property' : null
  if (action === 'provider.manage' || !isPermissionKey(action)) return null
  return actor.permissions?.[action] ?? null
}

/**
 * A tenant's records are their company's records (D10). Tenants not linked to a company yet see none (D19),
 * and work orders without a company are staff-only.
 */
export function isTenantRecord(actor: MemberActorLike, record: ScopedRecord) {
  return Boolean(actor.companyId) && record.company_id === actor.companyId
}

/** Whether the actor is a tenant-portal member who still has to be linked to a company (D19). */
export function isUnlinkedTenant(actor: ActorLike | null | undefined) {
  return actor?.kind === 'member' && actor.portal === 'tenant' && !actor.companyId
}

/** The scope `actor` holds for `action`, or null (UX helpers such as "show only assigned work"). */
export function scopeOf(actor: ActorLike | null | undefined, action: Action): Scope | null {
  if (!actor) return null
  if (actor.kind === 'provider') return providerCan(action) ? 'property' : null
  return memberScope(actor, action)
}

/**
 * Whether `actor` may perform `action`. Without a record this answers "may perform it at all" (menus, list
 * pages); with a record it also applies the role's scope to that record.
 */
export function can(actor: ActorLike | null | undefined, action: Action, record?: ScopedRecord): boolean {
  if (!actor) return false
  if (actor.kind === 'provider') return providerCan(action)

  const scope = memberScope(actor, action)
  if (!scope) return false
  // Company-scoped permissions need a company; unlinked tenants get none (D19)
  if (scope === 'company' && !actor.companyId) return false
  if (!record) return true
  if (!actor.propertyId || record.property_id !== actor.propertyId) return false

  switch (scope) {
    case 'property':
      return true
    case 'assigned':
      return Boolean(actor.engineerId) && record.engineer_id === actor.engineerId
    case 'company':
      return isTenantRecord(actor, record)
  }
}

/** The serializable subset of an actor that client components receive (menus, show/hide). */
export type ClientActor =
  | ProviderActorLike
  | {
      kind: 'member'
      portal: Portal
      permissions: Permissions
      isAdministrator: boolean
      roleId: string
      workType: WorkType
      propertyId: string
      engineerId: string
      companyId: string | null
    }

export function toClientActor(
  actor:
    | ProviderActorLike
    | (MemberActorLike & { isAdministrator: boolean; roleId: string; workType: WorkType; propertyId: string; engineerId: string })
): ClientActor {
  if (actor.kind === 'provider') return { kind: 'provider' }
  return {
    kind: 'member',
    portal: actor.portal,
    permissions: { ...actor.permissions },
    isAdministrator: actor.isAdministrator,
    roleId: actor.roleId,
    workType: actor.workType,
    propertyId: actor.propertyId,
    engineerId: actor.engineerId,
    companyId: actor.companyId ?? null,
  }
}
