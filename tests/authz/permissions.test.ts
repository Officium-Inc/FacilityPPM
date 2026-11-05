import { describe, expect, it } from 'vitest'
import {
  PERMISSIONS,
  PROPERTY_ROLES,
  assignableRoles,
  can,
  canManageMember,
  isUnlinkedTenant,
  toPropertyRole,
  type Action,
  type ActorLike,
  type PropertyRole,
} from '@/lib/authz/permissions'

/**
 * Expected matrix, row by row from
 * .github/skills/facilityppm-tenant-isolation/references/portal-role-matrix.md.
 * P = property-wide, A = assigned work only, C = own company / own requests, - = denied.
 */
type Cell = 'P' | 'A' | 'C' | '-'
const MATRIX: Record<Action, { provider: boolean } & Record<PropertyRole, Cell>> = {
  'portal.admin': { provider: true, admin: 'P', property_manager: 'P', head_engineer: 'P', service_group: 'P', tenant: '-' },
  'portal.tenant': { provider: false, admin: '-', property_manager: '-', head_engineer: '-', service_group: '-', tenant: 'P' },
  'property.profile.edit': { provider: false, admin: 'P', property_manager: 'P', head_engineer: '-', service_group: '-', tenant: '-' },
  'property.integrations.manage': { provider: false, admin: 'P', property_manager: 'P', head_engineer: '-', service_group: '-', tenant: '-' },
  'floors.view': { provider: true, admin: 'P', property_manager: 'P', head_engineer: 'P', service_group: '-', tenant: '-' },
  'floors.manage': { provider: false, admin: 'P', property_manager: '-', head_engineer: '-', service_group: '-', tenant: '-' },
  'companies.manage': { provider: false, admin: 'P', property_manager: 'P', head_engineer: '-', service_group: '-', tenant: '-' },
  'members.view': { provider: true, admin: 'P', property_manager: 'P', head_engineer: 'P', service_group: '-', tenant: '-' },
  'members.manage': { provider: false, admin: 'P', property_manager: 'P', head_engineer: '-', service_group: '-', tenant: '-' },
  'maintenance.view': { provider: true, admin: 'P', property_manager: 'P', head_engineer: 'P', service_group: '-', tenant: '-' },
  'maintenance.manage': { provider: false, admin: 'P', property_manager: 'P', head_engineer: 'P', service_group: '-', tenant: '-' },
  'workRequest.view': { provider: true, admin: 'P', property_manager: 'P', head_engineer: 'P', service_group: 'A', tenant: 'C' },
  'workRequest.submit': { provider: false, admin: '-', property_manager: '-', head_engineer: '-', service_group: '-', tenant: 'C' },
  'workRequest.submitOnBehalf': { provider: false, admin: 'P', property_manager: 'P', head_engineer: 'P', service_group: '-', tenant: '-' },
  'workRequest.review': { provider: false, admin: 'P', property_manager: 'P', head_engineer: 'P', service_group: '-', tenant: '-' },
  'workRequest.inspect': { provider: false, admin: 'P', property_manager: 'P', head_engineer: 'P', service_group: 'A', tenant: '-' },
  'workRequest.assign': { provider: false, admin: 'P', property_manager: 'P', head_engineer: 'P', service_group: '-', tenant: '-' },
  'workRequest.execute': { provider: false, admin: 'P', property_manager: 'P', head_engineer: 'P', service_group: 'A', tenant: '-' },
  'workRequest.cancel': { provider: false, admin: 'P', property_manager: 'P', head_engineer: 'P', service_group: '-', tenant: 'C' },
  'workRequest.waive': { provider: false, admin: '-', property_manager: 'P', head_engineer: '-', service_group: '-', tenant: '-' },
  'workRequest.waivedList': { provider: true, admin: 'P', property_manager: 'P', head_engineer: '-', service_group: '-', tenant: '-' },
  'workRequest.approve': { provider: false, admin: '-', property_manager: '-', head_engineer: '-', service_group: '-', tenant: 'C' },
  'workRequest.comment': { provider: false, admin: 'P', property_manager: 'P', head_engineer: 'P', service_group: 'A', tenant: 'C' },
  'provider.manage': { provider: true, admin: '-', property_manager: '-', head_engineer: '-', service_group: '-', tenant: '-' },
}

const PROPERTY = 'prop-1'
const OTHER_PROPERTY = 'prop-2'

function member(role: PropertyRole, overrides: Partial<Extract<ActorLike, { kind: 'member' }>> = {}): ActorLike {
  return { kind: 'member', role, propertyId: PROPERTY, engineerId: `eng-${role}`, email: `${role}@example.com`, companyId: 'co-1', ...overrides }
}

const provider: ActorLike = { kind: 'provider' }

describe('permission matrix', () => {
  it('covers exactly the actions defined in code', () => {
    expect(Object.keys(MATRIX).sort()).toEqual(Object.keys(PERMISSIONS).sort())
  })

  for (const [action, row] of Object.entries(MATRIX) as Array<[Action, (typeof MATRIX)[Action]]>) {
    it(`${action}: provider ${row.provider ? 'allowed' : 'denied'}`, () => {
      expect(can(provider, action)).toBe(row.provider)
    })

    for (const role of PROPERTY_ROLES) {
      const cell = row[role]
      it(`${action}: ${role} → ${cell}`, () => {
        const actor = member(role)
        expect(can(actor, action)).toBe(cell !== '-')

        const ownRecord = {
          property_id: PROPERTY,
          engineer_id: `eng-${role}`,
          requested_by_id: `eng-${role}`,
          company_id: 'co-1',
          tenant_email: null,
        }
        const otherRecord = {
          property_id: PROPERTY,
          engineer_id: 'someone-else',
          requested_by_id: 'someone-else',
          company_id: 'co-2',
          tenant_email: 'other@example.com',
        }

        expect(can(actor, action, ownRecord)).toBe(cell !== '-')
        expect(can(actor, action, otherRecord)).toBe(cell === 'P')
        expect(can(actor, action, { ...ownRecord, property_id: OTHER_PROPERTY })).toBe(false)
      })
    }
  }
})

describe('record scoping', () => {
  it('denies records of another property even for property-wide roles', () => {
    expect(can(member('admin'), 'workRequest.review', { property_id: OTHER_PROPERTY })).toBe(false)
  })

  it('lets Service Group act only on work orders assigned to them', () => {
    const sg = member('service_group', { engineerId: 'eng-7' })
    expect(can(sg, 'workRequest.execute', { property_id: PROPERTY, engineer_id: 'eng-7' })).toBe(true)
    expect(can(sg, 'workRequest.execute', { property_id: PROPERTY, engineer_id: null })).toBe(false)
    expect(can(sg, 'workRequest.execute', { property_id: PROPERTY, engineer_id: 'eng-8' })).toBe(false)
  })

  it('scopes tenants to their company, never by email or submitter alone', () => {
    const tenant = member('tenant', { engineerId: 'eng-t', email: 'a@b.co', companyId: 'co-1' })
    expect(can(tenant, 'workRequest.view', { property_id: PROPERTY, company_id: 'co-1', requested_by_id: 'other' })).toBe(true)
    expect(can(tenant, 'workRequest.view', { property_id: PROPERTY, company_id: 'co-2', requested_by_id: 'eng-t' })).toBe(false)
    expect(can(tenant, 'workRequest.view', { property_id: PROPERTY, company_id: null, tenant_email: 'a@b.co' })).toBe(false)
  })

  it('gives tenants not linked to a company no request access (D19)', () => {
    const unlinked = member('tenant', { companyId: null })
    expect(isUnlinkedTenant(unlinked)).toBe(true)
    expect(can(unlinked, 'portal.tenant')).toBe(true)
    expect(can(unlinked, 'workRequest.submit')).toBe(false)
    expect(can(unlinked, 'workRequest.view')).toBe(false)
    expect(can(unlinked, 'workRequest.view', { property_id: PROPERTY, company_id: null, requested_by_id: 'eng-tenant' })).toBe(false)
    expect(isUnlinkedTenant(member('tenant'))).toBe(false)
    expect(isUnlinkedTenant(member('admin', { companyId: null }))).toBe(false)
  })

  it('denies members without a property id when a record is given', () => {
    expect(can({ kind: 'member', role: 'admin' }, 'workRequest.view', { property_id: PROPERTY })).toBe(false)
  })

  it('denies a missing actor', () => {
    expect(can(null, 'portal.admin')).toBe(false)
  })
})

describe('member management (D6)', () => {
  it('Admins and providers may assign every role', () => {
    expect(assignableRoles(member('admin'))).toEqual(PROPERTY_ROLES)
    expect(assignableRoles(provider)).toEqual(PROPERTY_ROLES)
  })

  it('Property Managers may not assign Admin or Property Manager', () => {
    expect(assignableRoles(member('property_manager'))).toEqual(['head_engineer', 'service_group', 'tenant'])
  })

  it('other roles may not assign roles', () => {
    for (const role of ['head_engineer', 'service_group', 'tenant'] as const) {
      expect(assignableRoles(member(role))).toEqual([])
    }
  })

  it('Property Managers may not manage Admins or Property Managers', () => {
    const pm = member('property_manager')
    expect(canManageMember(pm, 'admin')).toBe(false)
    expect(canManageMember(pm, 'property_manager')).toBe(false)
    expect(canManageMember(pm, 'service group')).toBe(true)
    expect(canManageMember(pm, 'tenant')).toBe(true)
    expect(canManageMember(member('admin'), 'admin')).toBe(true)
    expect(canManageMember(member('head_engineer'), 'tenant')).toBe(false)
  })
})

describe('role names', () => {
  it('maps legacy names and retires viewer', () => {
    expect(toPropertyRole('service group')).toBe('service_group')
    expect(toPropertyRole('Administrator')).toBe('admin')
    expect(toPropertyRole('viewer')).toBeNull()
    expect(toPropertyRole('')).toBeNull()
    expect(toPropertyRole('superadmin')).toBeNull()
  })
})
