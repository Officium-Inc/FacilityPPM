import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PERMISSION_KEYS, PORTAL_ACTIONS, type Permissions } from '@/lib/authz/catalog'
import {
  can,
  isUnlinkedTenant,
  rolePermissions,
  scopeOf,
  type Action,
  type ActorLike,
  type MemberActorLike,
} from '@/lib/authz/permissions'
import { applyWorkOrderScope } from '@/lib/authz/records'
import { ROLE_TEMPLATES, SYSTEM_ROLE_KEYS, type SystemRoleKey } from '@/lib/authz/templates'

/**
 * Expected matrix for the default roles, row by row from
 * .github/skills/facilityppm-tenant-isolation/references/portal-role-matrix.md.
 * P = property-wide, A = assigned work only, C = own company, - = denied.
 * The only change from the fixed-role matrix is that the Administrator also waives charges (D8 superseded, D32);
 * `roles.manage` and `audit.view` are new keys.
 */
type Cell = 'P' | 'A' | 'C' | '-'
const MATRIX: Record<Action, { provider: boolean } & Record<SystemRoleKey, Cell>> = {
  'portal.admin': { provider: true, admin: 'P', property_manager: 'P', head_engineer: 'P', service_group: 'P', tenant: '-' },
  'portal.tenant': { provider: false, admin: '-', property_manager: '-', head_engineer: '-', service_group: '-', tenant: 'P' },
  'provider.manage': { provider: true, admin: '-', property_manager: '-', head_engineer: '-', service_group: '-', tenant: '-' },
  'property.profile.edit': { provider: false, admin: 'P', property_manager: 'P', head_engineer: '-', service_group: '-', tenant: '-' },
  'property.integrations.manage': { provider: false, admin: 'P', property_manager: 'P', head_engineer: '-', service_group: '-', tenant: '-' },
  'floors.view': { provider: true, admin: 'P', property_manager: 'P', head_engineer: 'P', service_group: '-', tenant: '-' },
  'floors.manage': { provider: false, admin: 'P', property_manager: '-', head_engineer: '-', service_group: '-', tenant: '-' },
  'companies.manage': { provider: false, admin: 'P', property_manager: 'P', head_engineer: '-', service_group: '-', tenant: '-' },
  'members.view': { provider: true, admin: 'P', property_manager: 'P', head_engineer: 'P', service_group: '-', tenant: '-' },
  'members.manage': { provider: false, admin: 'P', property_manager: 'P', head_engineer: '-', service_group: '-', tenant: '-' },
  'roles.manage': { provider: false, admin: 'P', property_manager: '-', head_engineer: '-', service_group: '-', tenant: '-' },
  'audit.view': { provider: true, admin: 'P', property_manager: 'P', head_engineer: '-', service_group: '-', tenant: '-' },
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
  'workRequest.waive': { provider: false, admin: 'P', property_manager: 'P', head_engineer: '-', service_group: '-', tenant: '-' },
  'workRequest.waivedList': { provider: true, admin: 'P', property_manager: 'P', head_engineer: '-', service_group: '-', tenant: '-' },
  'workRequest.approve': { provider: false, admin: '-', property_manager: '-', head_engineer: '-', service_group: '-', tenant: 'C' },
  'workRequest.comment': { provider: false, admin: 'P', property_manager: 'P', head_engineer: 'P', service_group: 'A', tenant: 'C' },
}

const PROPERTY = 'prop-1'
const OTHER_PROPERTY = 'prop-2'

/** The SQL seed of migration 026 (TEMPLATES:BEGIN/END): system key → grants. */
function seededTemplates(): Record<string, Permissions> {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/026_property_roles.sql'), 'utf8')
  const block = sql.slice(sql.indexOf('-- TEMPLATES:BEGIN'), sql.indexOf('-- TEMPLATES:END'))
  const grants: Record<string, Record<string, string>> = {}
  for (const match of block.matchAll(/\('(\w+)', '([\w.]+)', '(\w+)'\)/g)) {
    const [, key, permission, scope] = match
    grants[key] = { ...(grants[key] ?? {}), [permission]: scope }
  }
  return grants as Record<string, Permissions>
}

type MemberOverrides = Partial<Omit<MemberActorLike, 'kind'>>

/** An actor holding one of the default roles, exactly as resolveMembership() builds it. */
function member(role: SystemRoleKey, overrides: MemberOverrides = {}, grants?: Permissions): MemberActorLike {
  const template = ROLE_TEMPLATES[role]
  return {
    kind: 'member',
    portal: template.portal,
    permissions: rolePermissions({ portal: template.portal, locked: template.locked, permissions: grants ?? template.permissions }),
    isAdministrator: template.locked,
    propertyId: PROPERTY,
    engineerId: `eng-${role}`,
    email: `${role}@example.com`,
    companyId: template.portal === 'tenant' ? 'co-1' : null,
    ...overrides,
  }
}

const provider: ActorLike = { kind: 'provider' }

describe('permission matrix of the default roles', () => {
  it('covers exactly the actions in the catalog and the portal actions', () => {
    expect(Object.keys(MATRIX).sort()).toEqual([...PERMISSION_KEYS, ...PORTAL_ACTIONS].sort())
  })

  it('the SQL seed of migration 026 grants exactly the templates', () => {
    const seeded = seededTemplates()
    for (const key of SYSTEM_ROLE_KEYS) {
      if (ROLE_TEMPLATES[key].locked) {
        // The Administrator role has no stored grants: it is computed
        expect(seeded[key]).toBeUndefined()
        continue
      }
      expect(seeded[key]).toEqual(ROLE_TEMPLATES[key].permissions)
    }
  })

  for (const [action, row] of Object.entries(MATRIX) as Array<[Action, (typeof MATRIX)[Action]]>) {
    it(`${action}: provider ${row.provider ? 'allowed' : 'denied'}`, () => {
      expect(can(provider, action)).toBe(row.provider)
    })

    for (const role of SYSTEM_ROLE_KEYS) {
      const cell = row[role]
      it(`${action}: ${role} → ${cell}`, () => {
        // From the TypeScript template and from the SQL seed: both must give the same answers
        const actors = [member(role), member(role, {}, ROLE_TEMPLATES[role].locked ? undefined : seededTemplates()[role])]
        for (const actor of actors) {
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
        }
      })
    }
  }
})

describe('record scoping', () => {
  it('denies records of another property even for property-wide roles', () => {
    expect(can(member('admin'), 'workRequest.review', { property_id: OTHER_PROPERTY })).toBe(false)
  })

  it('lets assigned-scope roles act only on work orders assigned to them', () => {
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

  it('gives tenant-portal members not linked to a company no request access (D19)', () => {
    const unlinked = member('tenant', { companyId: null })
    expect(isUnlinkedTenant(unlinked)).toBe(true)
    expect(can(unlinked, 'portal.tenant')).toBe(true)
    expect(can(unlinked, 'workRequest.submit')).toBe(false)
    expect(can(unlinked, 'workRequest.view')).toBe(false)
    expect(isUnlinkedTenant(member('tenant'))).toBe(false)
    expect(isUnlinkedTenant(member('admin', { companyId: null }))).toBe(false)
  })

  it('denies members without a property id when a record is given', () => {
    expect(can({ ...member('admin'), propertyId: undefined }, 'workRequest.view', { property_id: PROPERTY })).toBe(false)
  })

  it('denies a missing actor and unknown actions', () => {
    expect(can(null, 'portal.admin')).toBe(false)
    expect(can(member('admin'), 'nope.unknown' as Action)).toBe(false)
  })
})

describe('custom roles', () => {
  it('fails closed on malformed grants: unknown keys and scopes the portal cannot use are dropped', () => {
    const permissions = rolePermissions({
      portal: 'staff',
      locked: false,
      permissions: { 'workRequest.view': 'company', 'workRequest.execute': 'assigned', 'made.up': 'property', 'workRequest.approve': 'company' },
    })
    expect(permissions).toEqual({ 'workRequest.execute': 'assigned', 'workRequest.view': 'assigned' })
  })

  it('gives a tenant role no staff powers, whatever is stored', () => {
    const permissions = rolePermissions({ portal: 'tenant', locked: false, permissions: { 'members.manage': 'property', 'workRequest.view': 'property' } })
    expect(permissions).toEqual({})
  })

  it('computes the locked Administrator role from the catalog (new modules included)', () => {
    const permissions = rolePermissions({ portal: 'staff', locked: true, permissions: {} })
    for (const key of PERMISSION_KEYS) {
      expect(Boolean(permissions[key])).toBe(MATRIX[key].admin === 'P')
    }
  })

  it('an inspector role sees assigned work only', () => {
    const inspector: MemberActorLike = {
      kind: 'member',
      portal: 'staff',
      permissions: rolePermissions({ portal: 'staff', locked: false, permissions: { 'workRequest.inspect': 'assigned' } }),
      propertyId: PROPERTY,
      engineerId: 'eng-i',
    }
    expect(scopeOf(inspector, 'workRequest.view')).toBe('assigned')
    expect(can(inspector, 'workRequest.view', { property_id: PROPERTY, engineer_id: 'eng-i' })).toBe(true)
    expect(can(inspector, 'workRequest.view', { property_id: PROPERTY, engineer_id: 'eng-x' })).toBe(false)
    expect(can(inspector, 'workRequest.execute')).toBe(false)
  })
})

describe('applyWorkOrderScope', () => {
  function fakeQuery() {
    const filters: Array<[string, string]> = []
    const query = {
      filters,
      eq(column: string, value: string) {
        filters.push([column, value])
        return query
      },
    }
    return query
  }

  it('lists everything for property scope and Platform Admin', () => {
    expect(applyWorkOrderScope(fakeQuery(), member('head_engineer'))?.filters).toEqual([])
    expect(applyWorkOrderScope(fakeQuery(), provider)?.filters).toEqual([])
  })

  it('filters by assignee or company, and returns nothing without the permission', () => {
    expect(applyWorkOrderScope(fakeQuery(), member('service_group', { engineerId: 'eng-9' }))?.filters).toEqual([['engineer_id', 'eng-9']])
    expect(applyWorkOrderScope(fakeQuery(), member('tenant', { companyId: 'co-5' }))?.filters).toEqual([['company_id', 'co-5']])
    expect(applyWorkOrderScope(fakeQuery(), member('tenant', { companyId: null }))).toBeNull()
    const noView: MemberActorLike = { kind: 'member', portal: 'staff', permissions: { 'floors.view': 'property' }, propertyId: PROPERTY, engineerId: 'e' }
    expect(applyWorkOrderScope(fakeQuery(), noView)).toBeNull()
  })
})
