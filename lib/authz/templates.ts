/**
 * The default roles every property starts with (D32). Seeded once per property by
 * `private.seed_property_roles()` in supabase/migrations/026_property_roles.sql (block TEMPLATES:BEGIN/END);
 * tests/authz/permissions.test.ts checks both against the original permission matrix.
 * Pure and client-safe (the Roles screen offers them as "start from" templates).
 */
import { administratorPermissions, type Permissions, type Portal } from './catalog'

export const SYSTEM_ROLE_KEYS = ['admin', 'property_manager', 'head_engineer', 'service_group', 'tenant'] as const
export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number]

/** What a staff member does in the work order flow (D33). Tenant roles are always `none`. */
export const WORK_TYPES = ['none', 'engineer', 'service_group'] as const
export type WorkType = (typeof WORK_TYPES)[number]

export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  none: 'None',
  engineer: 'Engineer',
  service_group: 'Service Group',
}

export const WORK_TYPE_DESCRIPTIONS: Record<WorkType, string> = {
  none: 'Office role. Never listed when work is assigned.',
  engineer: 'Supervising engineer, like the Head Engineer. Not assigned to do the work.',
  service_group: 'Manpower. Listed when a request is assigned for inspection or for the work itself.',
}

export function isWorkType(value: unknown): value is WorkType {
  return typeof value === 'string' && (WORK_TYPES as readonly string[]).includes(value)
}

export interface RoleTemplate {
  key: SystemRoleKey
  name: string
  description: string
  portal: Portal
  workType: WorkType
  /** The Administrator role is locked: every staff permission, computed, never edited or deleted. */
  locked: boolean
  permissions: Permissions
}

export const ROLE_TEMPLATES: Record<SystemRoleKey, RoleTemplate> = {
  admin: {
    key: 'admin',
    name: 'Administrator',
    description: 'Full access to the property. Cannot be edited or deleted.',
    portal: 'staff',
    workType: 'none',
    locked: true,
    permissions: administratorPermissions(),
  },
  property_manager: {
    key: 'property_manager',
    name: 'Property Manager',
    description: 'Runs the building: members, tenant companies, settings and every work request.',
    portal: 'staff',
    workType: 'none',
    locked: false,
    permissions: {
      'property.profile.edit': 'property',
      'property.integrations.manage': 'property',
      'floors.view': 'property',
      'companies.manage': 'property',
      'members.view': 'property',
      'members.manage': 'property',
      'audit.view': 'property',
      'maintenance.view': 'property',
      'maintenance.manage': 'property',
      'workRequest.view': 'property',
      'workRequest.submitOnBehalf': 'property',
      'workRequest.review': 'property',
      'workRequest.inspect': 'property',
      'workRequest.assign': 'property',
      'workRequest.execute': 'property',
      'workRequest.cancel': 'property',
      'workRequest.waive': 'property',
      'workRequest.waivedList': 'property',
      'workRequest.comment': 'property',
    },
  },
  head_engineer: {
    key: 'head_engineer',
    name: 'Head Engineer',
    description: 'Leads the maintenance work: reviews, inspects, assigns and verifies.',
    portal: 'staff',
    workType: 'engineer',
    locked: false,
    permissions: {
      'floors.view': 'property',
      'members.view': 'property',
      'maintenance.view': 'property',
      'maintenance.manage': 'property',
      'workRequest.view': 'property',
      'workRequest.submitOnBehalf': 'property',
      'workRequest.review': 'property',
      'workRequest.inspect': 'property',
      'workRequest.assign': 'property',
      'workRequest.execute': 'property',
      'workRequest.cancel': 'property',
      'workRequest.comment': 'property',
    },
  },
  service_group: {
    key: 'service_group',
    name: 'Service Group',
    description: 'Manpower assigned to inspect and fix requests. Sees only work assigned to them.',
    portal: 'staff',
    workType: 'service_group',
    locked: false,
    permissions: {
      'workRequest.view': 'assigned',
      'workRequest.inspect': 'assigned',
      'workRequest.execute': 'assigned',
      'workRequest.comment': 'assigned',
    },
  },
  tenant: {
    key: 'tenant',
    name: 'Tenant',
    description: 'A member of a tenant company: submits and follows the company’s requests.',
    portal: 'tenant',
    workType: 'none',
    locked: false,
    permissions: {
      'workRequest.view': 'company',
      'workRequest.submit': 'company',
      'workRequest.cancel': 'company',
      'workRequest.approve': 'company',
      'workRequest.comment': 'company',
    },
  },
}

export function isSystemRoleKey(value: unknown): value is SystemRoleKey {
  return typeof value === 'string' && (SYSTEM_ROLE_KEYS as readonly string[]).includes(value)
}
