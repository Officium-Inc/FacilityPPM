/**
 * Privilege-escalation rules for custom roles (replaces D6). Pure and client-safe.
 *
 * Administrators (the locked role, which Org Admins hold too) are exempt. Anyone else may give, manage or edit a
 * staff role only when that role's permissions are a STRICT subset of their own (same scope or narrower), so a
 * Property Manager can assign Head Engineer and Service Group but not Administrator or Property Manager.
 * Tenant-portal roles hold only tenant permissions, which cannot raise staff access, so anyone who manages members
 * may assign them. Platform Admin is read-only inside a property (D2) and manages members from its own dashboard.
 */
import { PERMISSION_KEYS, scopeCovers, type Permissions, type Portal } from './catalog'
import { can, type ActorLike } from './permissions'

/** A role with its effective permissions (see `rolePermissions`). */
export interface EscalationRole {
  id: string
  portal: Portal
  isLocked: boolean
  permissions: Permissions
}

/** `sub` grants nothing beyond `sup` (scope by scope) and `sup` grants something more. */
export function isStrictSubset(sub: Permissions, sup: Permissions): boolean {
  let smaller = false
  for (const key of PERMISSION_KEYS) {
    const subScope = sub[key]
    const supScope = sup[key]
    if (subScope) {
      if (!supScope || !scopeCovers(supScope, subScope)) return false
      if (supScope !== subScope) smaller = true
    } else if (supScope) {
      smaller = true
    }
  }
  return smaller
}

function isAdministrator(actor: ActorLike | null | undefined) {
  return actor?.kind === 'member' && actor.isAdministrator === true
}

/** Whether `actor` may give `role` to a member (invite, add, change role) or manage members holding it. */
export function canAssignRole(actor: ActorLike | null | undefined, role: EscalationRole): boolean {
  if (!actor || actor.kind !== 'member') return false
  if (!can(actor, 'members.manage')) return false
  if (isAdministrator(actor)) return true
  if (role.isLocked) return false
  if (role.portal === 'tenant') return true
  return actor.portal === 'staff' && isStrictSubset(role.permissions, actor.permissions)
}

/** Whether `actor` may edit, deactivate or remove a member who holds `role`. Same rule as assigning it. */
export function canManageMemberRole(actor: ActorLike | null | undefined, role: EscalationRole | null): boolean {
  if (!actor || actor.kind !== 'member' || !can(actor, 'members.manage')) return false
  // Members whose role could not be resolved (retired/unknown) can only be fixed by an Administrator
  if (!role) return isAdministrator(actor)
  return canAssignRole(actor, role)
}

/**
 * Whether `actor` may create a role with `next` permissions, or change an existing role to it. The locked
 * Administrator role cannot be edited, and nobody edits the role they hold.
 */
export function canEditRole(
  actor: ActorLike | null | undefined,
  role: { id?: string; portal: Portal; isLocked: boolean },
  next: Permissions,
  current?: Permissions
): boolean {
  if (!actor || actor.kind !== 'member' || !can(actor, 'roles.manage')) return false
  if (role.isLocked) return false
  if (role.id && actor.roleId === role.id) return false
  if (isAdministrator(actor)) return true
  if (role.portal === 'tenant') return true
  if (actor.portal !== 'staff') return false
  // Both the role as it is and as it will be must stay below the editor's own access
  return isStrictSubset(next, actor.permissions) && (!current || isStrictSubset(current, actor.permissions))
}

/** Whether `actor` may delete `role` (the API also requires that nobody holds it and no invitation names it). */
export function canDeleteRole(actor: ActorLike | null | undefined, role: EscalationRole): boolean {
  return canEditRole(actor, role, role.permissions, role.permissions)
}
