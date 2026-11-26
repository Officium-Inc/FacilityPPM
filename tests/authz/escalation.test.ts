import { describe, expect, it } from 'vitest'
import { normalizePermissions, type Permissions, type Portal } from '@/lib/authz/catalog'
import { canAssignRole, canDeleteRole, canEditRole, canManageMemberRole, isStrictSubset, type EscalationRole } from '@/lib/authz/escalation'
import { rolePermissions, type MemberActorLike } from '@/lib/authz/permissions'
import { isAssignableRole } from '@/lib/authz/property-role'
import { parseRoleInput } from '@/lib/authz/role-input'
import { ROLE_TEMPLATES, type SystemRoleKey } from '@/lib/authz/templates'

function role(key: SystemRoleKey): EscalationRole & { workType: string } {
  const template = ROLE_TEMPLATES[key]
  return {
    id: `role-${key}`,
    portal: template.portal,
    isLocked: template.locked,
    workType: template.workType,
    permissions: rolePermissions({ portal: template.portal, locked: template.locked, permissions: template.permissions }),
  }
}

function custom(id: string, portal: Portal, grants: Record<string, string>): EscalationRole {
  return { id, portal, isLocked: false, permissions: normalizePermissions(grants, portal) }
}

function actorWith(r: EscalationRole): MemberActorLike {
  return { kind: 'member', portal: r.portal, permissions: r.permissions, isAdministrator: r.isLocked, roleId: r.id, propertyId: 'p', engineerId: 'e' }
}

const ALL: SystemRoleKey[] = ['admin', 'property_manager', 'head_engineer', 'service_group', 'tenant']

describe('strict subset', () => {
  it('compares grants scope by scope', () => {
    const sg = role('service_group').permissions
    const he = role('head_engineer').permissions
    expect(isStrictSubset(sg, he)).toBe(true)
    expect(isStrictSubset(he, he)).toBe(false)
    expect(isStrictSubset(he, sg)).toBe(false)
    const assignedView: Permissions = { 'workRequest.view': 'assigned' }
    expect(isStrictSubset(assignedView, { 'workRequest.view': 'property' })).toBe(true)
    expect(isStrictSubset({ 'workRequest.view': 'property' }, assignedView)).toBe(false)
    expect(isStrictSubset({}, assignedView)).toBe(true)
    expect(isStrictSubset({}, {})).toBe(false)
  })
})

describe('assigning roles (replaces D6)', () => {
  it('Administrators may give every role, including Administrator', () => {
    const admin = actorWith(role('admin'))
    for (const key of ALL) expect(canAssignRole(admin, role(key)), key).toBe(true)
  })

  it('Property Managers may give Head Engineer, Service Group and Tenant, not Administrator or Property Manager', () => {
    const pm = actorWith(role('property_manager'))
    expect(ALL.filter((key) => canAssignRole(pm, role(key)))).toEqual(['head_engineer', 'service_group', 'tenant'])
  })

  it('roles without members.manage give nothing; Platform Admin manages members from its own dashboard', () => {
    for (const key of ['head_engineer', 'service_group', 'tenant'] as const) {
      const actor = actorWith(role(key))
      expect(ALL.filter((target) => canAssignRole(actor, role(target))), key).toEqual([])
    }
    expect(canAssignRole({ kind: 'provider' }, role('tenant'))).toBe(false)
  })

  it('a custom member manager may give tenant roles and staff roles strictly below their own', () => {
    const coordinator = custom('coordinator', 'staff', {
      'members.manage': 'property',
      'workRequest.view': 'property',
      'workRequest.comment': 'property',
    })
    const actor = actorWith(coordinator)
    expect(canAssignRole(actor, role('tenant'))).toBe(true)
    expect(canAssignRole(actor, role('service_group'))).toBe(false) // inspect/execute are beyond them
    expect(canAssignRole(actor, custom('viewer', 'staff', { 'workRequest.view': 'assigned' }))).toBe(true)
    expect(canAssignRole(actor, coordinator)).toBe(false) // not strictly below
  })

  it('members whose role is unknown can only be managed by Administrators', () => {
    expect(canManageMemberRole(actorWith(role('admin')), null)).toBe(true)
    expect(canManageMemberRole(actorWith(role('property_manager')), null)).toBe(false)
  })
})

describe('editing roles', () => {
  const admin = actorWith(role('admin'))
  const pm = actorWith(role('property_manager'))
  const roleManager = custom('role-manager', 'staff', {
    'roles.manage': 'property',
    'workRequest.view': 'property',
    'workRequest.inspect': 'property',
    'workRequest.execute': 'property',
  })

  it('only roles.manage edits roles; the Administrator role and your own role are off limits', () => {
    expect(canEditRole(admin, { portal: 'staff', isLocked: false }, {})).toBe(true)
    expect(canEditRole(pm, { portal: 'staff', isLocked: false }, {})).toBe(false)
    expect(canEditRole(admin, role('admin'), role('admin').permissions)).toBe(false)
    const own = actorWith(roleManager)
    expect(canEditRole(own, roleManager, { 'workRequest.view': 'assigned' })).toBe(false)
    expect(canEditRole({ kind: 'provider' }, { portal: 'staff', isLocked: false }, {})).toBe(false)
  })

  it('a non-Administrator keeps roles strictly below their own access, before and after the change', () => {
    const actor = actorWith(roleManager)
    const below = normalizePermissions({ 'workRequest.inspect': 'assigned' }, 'staff')
    expect(canEditRole(actor, { portal: 'staff', isLocked: false }, below)).toBe(true)
    expect(canEditRole(actor, { portal: 'staff', isLocked: false }, roleManager.permissions)).toBe(false)
    expect(canEditRole(actor, { portal: 'staff', isLocked: false }, { 'members.manage': 'property', 'members.view': 'property' })).toBe(false)
    // Editing Head Engineer (above them today) is refused even when the new grants would be below
    expect(canEditRole(actor, role('head_engineer'), below, role('head_engineer').permissions)).toBe(false)
    expect(canDeleteRole(actor, role('head_engineer'))).toBe(false)
    expect(canDeleteRole(actor, custom('x', 'staff', { 'workRequest.view': 'assigned' }))).toBe(true)
  })
})

describe('assignable members (D33)', () => {
  it('lists only Service Group roles that hold the permission', () => {
    const sg = { ...role('service_group'), workType: 'service_group' as const }
    expect(isAssignableRole(sg, 'workRequest.inspect')).toBe(true)
    expect(isAssignableRole(sg, 'workRequest.execute')).toBe(true)
    // The Administrator role (and so every Org Admin) is never assignable
    expect(isAssignableRole({ ...role('admin'), workType: 'none' as const }, 'workRequest.execute')).toBe(false)
    expect(isAssignableRole({ ...role('head_engineer'), workType: 'engineer' as const }, 'workRequest.execute')).toBe(false)
    const inspectorsOnly = { portal: 'staff' as const, workType: 'service_group' as const, permissions: normalizePermissions({ 'workRequest.inspect': 'assigned' }, 'staff') }
    expect(isAssignableRole(inspectorsOnly, 'workRequest.inspect')).toBe(true)
    expect(isAssignableRole(inspectorsOnly, 'workRequest.execute')).toBe(false)
    expect(isAssignableRole(null, 'workRequest.execute')).toBe(false)
  })
})

describe('role input', () => {
  it('parses a new role and normalizes its permissions', () => {
    expect(parseRoleInput({
      name: '  Electrical   Team ',
      portal: 'staff',
      work_type: 'service_group',
      permissions: { 'workRequest.execute': 'assigned', 'bogus': 'property' },
    })).toEqual({
      name: 'Electrical Team',
      description: null,
      portal: 'staff',
      workType: 'service_group',
      permissions: { 'workRequest.execute': 'assigned', 'workRequest.view': 'assigned' },
    })
  })

  it('rejects missing names, unknown portals, tenant work types and portal changes', () => {
    expect(parseRoleInput({ name: ' ', portal: 'staff' })).toHaveProperty('error')
    expect(parseRoleInput({ name: 'A', portal: 'vendor' })).toHaveProperty('error')
    expect(parseRoleInput({ name: 'A', portal: 'tenant', work_type: 'engineer' })).toHaveProperty('error')
    expect(parseRoleInput({ name: 'x'.repeat(61), portal: 'staff' })).toHaveProperty('error')
    const current = { name: 'Team', description: null, portal: 'staff' as const, workType: 'none' as const, permissions: {} }
    expect(parseRoleInput({ portal: 'tenant' }, current)).toHaveProperty('error')
    expect(parseRoleInput({ work_type: 'engineer' }, current)).toMatchObject({ name: 'Team', portal: 'staff', workType: 'engineer' })
  })
})
