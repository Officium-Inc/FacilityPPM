import { describe, expect, it } from 'vitest'
import {
  assignableOrgRoles,
  canManageOrgMember,
  canOrg,
  leavesNoActiveOwner,
  type OrgActorLike,
} from '@/lib/org/roles'
import { parseOrgProfile } from '@/lib/org/profile'

const provider: OrgActorLike = { kind: 'provider' }
const owner: OrgActorLike = { kind: 'org_member', orgRole: 'owner' }
const admin: OrgActorLike = { kind: 'org_member', orgRole: 'admin' }

describe('org portal actions (D30)', () => {
  it('lets Org Admins manage the organization and keeps Platform Admin read-only there', () => {
    for (const actor of [owner, admin]) {
      expect(canOrg(actor, 'org.view')).toBe(true)
      expect(canOrg(actor, 'org.profile.edit')).toBe(true)
      expect(canOrg(actor, 'org.members.manage')).toBe(true)
    }
    expect(canOrg(provider, 'org.view')).toBe(true)
    expect(canOrg(provider, 'org.profile.edit')).toBe(false)
    expect(canOrg(provider, 'org.members.manage')).toBe(false)
    expect(canOrg(null, 'org.view')).toBe(false)
  })

  it('fails closed on an unknown org role', () => {
    const unknown = { kind: 'org_member', orgRole: 'viewer' } as unknown as OrgActorLike
    expect(canOrg(unknown, 'org.view')).toBe(false)
    expect(assignableOrgRoles(unknown)).toEqual([])
    expect(canManageOrgMember(unknown, 'admin')).toBe(false)
  })
})

describe('owner rules', () => {
  it('only owners and Platform Admin give or change the owner role', () => {
    expect(assignableOrgRoles(provider)).toEqual(['owner', 'admin'])
    expect(assignableOrgRoles(owner)).toEqual(['owner', 'admin'])
    expect(assignableOrgRoles(admin)).toEqual(['admin'])
    expect(canManageOrgMember(owner, 'owner')).toBe(true)
    expect(canManageOrgMember(admin, 'owner')).toBe(false)
    expect(canManageOrgMember(admin, 'admin')).toBe(true)
    expect(canManageOrgMember(provider, 'owner')).toBe(true)
  })

  it('keeps at least one active owner', () => {
    const members = [
      { id: 'o1', org_role: 'owner', is_active: true },
      { id: 'a1', org_role: 'admin', is_active: true },
      { id: 'o2', org_role: 'owner', is_active: false },
    ]
    expect(leavesNoActiveOwner(members, 'o1', 'remove')).toBe(true)
    expect(leavesNoActiveOwner(members, 'o1', { is_active: false })).toBe(true)
    expect(leavesNoActiveOwner(members, 'o1', { org_role: 'admin' })).toBe(true)
    expect(leavesNoActiveOwner(members, 'o1', { org_role: 'owner', is_active: true })).toBe(false)
    expect(leavesNoActiveOwner(members, 'a1', 'remove')).toBe(false)
    expect(leavesNoActiveOwner(members, 'o2', 'remove')).toBe(false)

    const twoOwners = [...members, { id: 'o3', org_role: 'owner', is_active: true }]
    expect(leavesNoActiveOwner(twoOwners, 'o1', 'remove')).toBe(false)
  })
})

describe('parseOrgProfile', () => {
  it('accepts profile fields, clears blanks and ignores unknown keys', () => {
    expect(parseOrgProfile({ name: ' Acme ', contact_email: 'ops@acme.ph', city: '  ', license_status: 'active' })).toEqual({
      name: 'Acme',
      contact_email: 'ops@acme.ph',
      city: null,
    })
  })

  it('rejects an empty name, a bad email and non-string values', () => {
    expect(parseOrgProfile({ name: '' })).toHaveProperty('error')
    expect(parseOrgProfile({ contact_email: 'not-an-email' })).toHaveProperty('error')
    expect(parseOrgProfile({ address: 42 })).toHaveProperty('error')
  })
})
