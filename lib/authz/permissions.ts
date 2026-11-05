/**
 * The permission matrix in code. Source of truth:
 * .github/skills/facilityppm-tenant-isolation/references/portal-role-matrix.md
 *
 * Pure (no server imports) so client components can use `can()` to show or hide controls.
 * Hiding a control is only UX; server routes and pages enforce the same rules with lib/authz/guard.ts.
 */
import { normalizeRoleName } from '@/lib/roles'

export const PROPERTY_ROLES = ['admin', 'property_manager', 'head_engineer', 'service_group', 'tenant'] as const
export type PropertyRole = (typeof PROPERTY_ROLES)[number]

/** How far a role's permission reaches inside its property. */
export type Scope =
  | 'property' // any record of the property
  | 'assigned' // records assigned to the member (work_orders.engineer_id)
  | 'company' // records of the tenant's own company / own requests

interface ActionRule {
  roles: Partial<Record<PropertyRole, Scope>>
  /** Providers manage properties from the Provider Dashboard; inside a property they are read-only (D2). */
  provider: boolean
}

const STAFF = { admin: 'property', property_manager: 'property', head_engineer: 'property' } as const
const MANAGERS = { admin: 'property', property_manager: 'property' } as const

export const PERMISSIONS = {
  // Portals
  'portal.admin': { roles: { ...STAFF, service_group: 'property' }, provider: true },
  'portal.tenant': { roles: { tenant: 'property' }, provider: false },

  // Property customization (Admin Portal)
  'property.profile.edit': { roles: MANAGERS, provider: false },
  'property.integrations.manage': { roles: MANAGERS, provider: false },
  'floors.view': { roles: STAFF, provider: true },
  'floors.manage': { roles: { admin: 'property' }, provider: false },
  'companies.manage': { roles: MANAGERS, provider: false },
  'members.view': { roles: STAFF, provider: true },
  'members.manage': { roles: MANAGERS, provider: false },
  'maintenance.view': { roles: STAFF, provider: true },
  'maintenance.manage': { roles: STAFF, provider: false },

  // Work requests
  'workRequest.view': {
    roles: { ...STAFF, service_group: 'assigned', tenant: 'company' },
    provider: true,
  },
  'workRequest.submit': { roles: { tenant: 'company' }, provider: false },
  'workRequest.submitOnBehalf': { roles: STAFF, provider: false },
  'workRequest.review': { roles: STAFF, provider: false },
  'workRequest.inspect': { roles: { ...STAFF, service_group: 'assigned' }, provider: false },
  'workRequest.assign': { roles: STAFF, provider: false },
  'workRequest.execute': { roles: { ...STAFF, service_group: 'assigned' }, provider: false },
  'workRequest.cancel': { roles: { ...STAFF, tenant: 'company' }, provider: false },
  'workRequest.waive': { roles: { property_manager: 'property' }, provider: false },
  'workRequest.waivedList': { roles: MANAGERS, provider: true },
  'workRequest.approve': { roles: { tenant: 'company' }, provider: false },
  'workRequest.comment': {
    roles: { ...STAFF, service_group: 'assigned', tenant: 'company' },
    provider: false,
  },

  // Provider Dashboard
  'provider.manage': { roles: {}, provider: true },
} satisfies Record<string, ActionRule>

export type Action = keyof typeof PERMISSIONS

export type ProviderActorLike = { kind: 'provider' }
export type MemberActorLike = {
  kind: 'member'
  role: PropertyRole
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

/** Maps a stored role name to a property role. Unknown, empty and retired (`viewer`) roles map to null. */
export function toPropertyRole(roleName: string | null | undefined): PropertyRole | null {
  const normalized = normalizeRoleName(roleName)
  return (PROPERTY_ROLES as readonly string[]).includes(normalized) ? (normalized as PropertyRole) : null
}

const normalizeEmail = (value: string | null | undefined) => (value ?? '').trim().toLowerCase()

/**
 * A tenant's records: their company's requests once companies are linked (D10), otherwise only requests
 * they submitted or that are addressed to their exact email.
 */
export function isTenantRecord(actor: MemberActorLike, record: ScopedRecord) {
  if (actor.companyId && record.company_id) return record.company_id === actor.companyId
  if (actor.engineerId && record.requested_by_id === actor.engineerId) return true
  const email = normalizeEmail(actor.email)
  if (!email) return false
  return normalizeEmail(record.tenant_email) === email || normalizeEmail(record.reported_by_contact) === email
}

/**
 * Whether `actor` may perform `action`. Without a record this answers "may perform it at all" (menus, list
 * pages); with a record it also applies the role's scope to that record.
 */
export function can(actor: ActorLike | null | undefined, action: Action, record?: ScopedRecord): boolean {
  if (!actor) return false
  const rule: ActionRule = PERMISSIONS[action]
  if (actor.kind === 'provider') return rule.provider

  const scope = rule.roles[actor.role]
  if (!scope) return false
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

/** Roles `actor` may give to a member (D6): Property Managers cannot create Admins or other Property Managers. */
export function assignableRoles(actor: ActorLike | null | undefined): readonly PropertyRole[] {
  if (!actor) return []
  if (actor.kind === 'provider' || actor.role === 'admin') return PROPERTY_ROLES
  if (actor.role === 'property_manager') return ['head_engineer', 'service_group', 'tenant']
  return []
}

/** Whether `actor` may edit, deactivate or remove a member whose current role is `targetRole` (D6). */
export function canManageMember(actor: ActorLike | null | undefined, targetRole: string | null | undefined) {
  if (!actor) return false
  if (actor.kind === 'provider' || actor.role === 'admin') return true
  if (actor.role !== 'property_manager') return false
  const target = toPropertyRole(targetRole)
  return target !== 'admin' && target !== 'property_manager'
}
