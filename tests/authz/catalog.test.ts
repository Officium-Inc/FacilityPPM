import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MODULES,
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
  STAFF_PERMISSION_KEYS,
  normalizePermissions,
  scopesFor,
} from '@/lib/authz/catalog'
import { ROLE_TEMPLATES, SYSTEM_ROLE_KEYS } from '@/lib/authz/templates'

/** The permission_keys seed of migration 026 (CATALOG:BEGIN/END). */
function seededCatalog() {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/026_property_roles.sql'), 'utf8')
  const block = sql.slice(sql.indexOf('-- CATALOG:BEGIN'), sql.indexOf('-- CATALOG:END'))
  const rows = new Map<string, { module: string; label: string; portals: string[]; scopes: string[] }>()
  for (const match of block.matchAll(/\('([\w.]+)', '(\w+)', '((?:[^']|'')*)', '\{([^}]*)\}', '\{([^}]*)\}', \d+\)/g)) {
    const [, key, module, label, portals, scopes] = match
    rows.set(key, { module, label: label.replace(/''/g, "'"), portals: portals.split(','), scopes: scopes.split(',') })
  }
  return rows
}

describe('permission catalog', () => {
  it('matches the permission_keys seed of migration 026 key by key', () => {
    const seeded = seededCatalog()
    expect([...seeded.keys()].sort()).toEqual([...PERMISSION_KEYS].sort())
    for (const key of PERMISSION_KEYS) {
      const definition = PERMISSION_CATALOG[key]
      const row = seeded.get(key)
      expect(row, key).toBeDefined()
      expect(row?.module, key).toBe(definition.module)
      expect(row?.label, key).toBe(definition.label)
      expect(row?.portals, key).toEqual([...definition.portals])
      expect(row?.scopes, key).toEqual([...definition.scopes])
    }
  })

  it('puts every key in a known module with a scope its portals can use', () => {
    const modules = new Set(MODULES.map((module) => module.key))
    for (const key of PERMISSION_KEYS) {
      const definition = PERMISSION_CATALOG[key]
      expect(modules.has(definition.module), key).toBe(true)
      for (const portal of definition.portals) expect(scopesFor(key, portal).length, `${key} on ${portal}`).toBeGreaterThan(0)
    }
  })

  it('only implies keys that exist for the same portal', () => {
    for (const key of PERMISSION_KEYS) {
      for (const implied of PERMISSION_CATALOG[key].implies ?? []) {
        expect(PERMISSION_KEYS.includes(implied), `${key} → ${implied}`).toBe(true)
        for (const portal of PERMISSION_CATALOG[key].portals) {
          expect(PERMISSION_CATALOG[implied].portals.includes(portal), `${key} → ${implied} (${portal})`).toBe(true)
        }
      }
    }
  })

  it('keeps the default roles normalized (implied permissions present) and tenant roles tenant-only', () => {
    for (const key of SYSTEM_ROLE_KEYS) {
      const template = ROLE_TEMPLATES[key]
      if (template.locked) continue
      expect(normalizePermissions(template.permissions, template.portal), key).toEqual(template.permissions)
    }
    for (const permission of Object.keys(ROLE_TEMPLATES.tenant.permissions)) {
      expect(PERMISSION_CATALOG[permission as keyof typeof PERMISSION_CATALOG].portals).toContain('tenant')
    }
  })

  it('normalizes idempotently and adds implied grants at the same scope', () => {
    const once = normalizePermissions({ 'workRequest.execute': 'assigned', 'workRequest.waive': 'property' }, 'staff')
    expect(once).toEqual({
      'workRequest.execute': 'assigned',
      'workRequest.view': 'property',
      'workRequest.waive': 'property',
      'workRequest.waivedList': 'property',
    })
    expect(normalizePermissions(once, 'staff')).toEqual(once)
    // An assigned grant never implies a property-wide one
    expect(normalizePermissions({ 'workRequest.inspect': 'assigned' }, 'staff')).toEqual({
      'workRequest.inspect': 'assigned',
      'workRequest.view': 'assigned',
    })
    expect(normalizePermissions(null, 'staff')).toEqual({})
    expect(normalizePermissions({ 'roles.manage': 'assigned' }, 'staff')).toEqual({})
  })

  it('lists the staff keys the Administrator role holds', () => {
    expect(STAFF_PERMISSION_KEYS).toContain('roles.manage')
    expect(STAFF_PERMISSION_KEYS).toContain('workRequest.waive')
    expect(STAFF_PERMISSION_KEYS).not.toContain('workRequest.submit')
    expect(STAFF_PERMISSION_KEYS).not.toContain('workRequest.approve')
  })
})
