/**
 * Organization roles and what they may do (D30). Pure (no server imports) so client components can show or
 * hide controls; the org routes enforce the same rules on the server.
 *
 * Every Org Admin (`owner` or `admin`) is an Administrator in every property of the organization and may edit
 * the organization profile and manage Org Admins. Only owners may give or change the `owner` role, and an
 * owner can only be changed or removed by another owner. An organization keeps at least one active owner;
 * Platform Admin can always override (it restores access by inviting a new owner).
 */

export const ORG_ROLES = ['owner', 'admin'] as const
export type OrgRole = (typeof ORG_ROLES)[number]

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Org Admin',
}

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === 'string' && (ORG_ROLES as readonly string[]).includes(value)
}

export function formatOrgRole(value: string | null | undefined) {
  return isOrgRole(value) ? ORG_ROLE_LABELS[value] : 'Org Admin'
}

export type OrgActorLike =
  | { kind: 'provider' }
  | { kind: 'org_member'; orgRole: OrgRole; memberId?: string; userId?: string }

export const ORG_ACTIONS = ['org.view', 'org.profile.edit', 'org.members.manage'] as const
export type OrgAction = (typeof ORG_ACTIONS)[number]

/** Platform Admin manages organizations from its own dashboard; the org portal is for Org Admins. */
export function canOrg(actor: OrgActorLike | null | undefined, action: OrgAction): boolean {
  if (!actor) return false
  if (actor.kind === 'provider') return action === 'org.view'
  return isOrgRole(actor.orgRole)
}

/** Org roles `actor` may give (invite or change to). */
export function assignableOrgRoles(actor: OrgActorLike | null | undefined): readonly OrgRole[] {
  if (!actor) return []
  if (actor.kind === 'provider' || actor.orgRole === 'owner') return ORG_ROLES
  if (actor.orgRole === 'admin') return ['admin']
  return []
}

/** Whether `actor` may change, deactivate or remove an org member whose role is `targetRole`. */
export function canManageOrgMember(actor: OrgActorLike | null | undefined, targetRole: string | null | undefined) {
  if (!actor) return false
  if (actor.kind === 'provider' || actor.orgRole === 'owner') return true
  return actor.orgRole === 'admin' && targetRole !== 'owner'
}

export interface OrgMemberLike {
  id: string
  org_role: string
  is_active: boolean
}

/**
 * Whether applying `change` to member `memberId` would leave the organization without an active owner.
 * `change = 'remove'` deletes the member; otherwise the member's new role and status.
 */
export function leavesNoActiveOwner(
  members: readonly OrgMemberLike[],
  memberId: string,
  change: 'remove' | { org_role?: string; is_active?: boolean }
) {
  const target = members.find((member) => member.id === memberId)
  if (!target || target.org_role !== 'owner' || !target.is_active) return false
  if (change !== 'remove') {
    const stillOwner = (change.org_role ?? target.org_role) === 'owner'
    const stillActive = change.is_active ?? target.is_active
    if (stillOwner && stillActive) return false
  }
  return !members.some((member) => member.id !== memberId && member.org_role === 'owner' && member.is_active)
}
