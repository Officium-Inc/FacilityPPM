import { describe, expect, it } from 'vitest'
import { buildAccessMetadata } from '@/lib/auth-users'
import { isReservedSlug, slugError, slugify } from '@/lib/reserved-slugs'
import { homePath } from '@/lib/supabase/middleware'

const P1 = { id: 'p1', slug: 'tower-1' }
const P2 = { id: 'p2', slug: 'tower-2' }
const P3 = { id: 'p3', slug: 'tower-3' }
const ORG = { id: 'o1', slug: 'acme' }

describe('buildAccessMetadata (syncUserAccess)', () => {
  it('lists own properties and organizations, not organization properties', () => {
    const meta = buildAccessMetadata({}, { properties: [P1], organizations: [ORG], organizationProperties: [P2, P3] })
    expect(meta).toMatchObject({
      property_ids: ['p1'],
      property_slugs: ['tower-1'],
      org_ids: ['o1'],
      org_slugs: ['acme'],
      property_id: 'p1',
      property_slug: 'tower-1',
    })
  })

  it('keeps a reachable active property, including one reached through the organization', () => {
    const meta = buildAccessMetadata(
      { property_id: 'p3', property_slug: 'tower-3' },
      { properties: [P1], organizations: [ORG], organizationProperties: [P3] }
    )
    expect(meta.property_id).toBe('p3')
    expect(meta.property_slug).toBe('tower-3')
  })

  it('moves the active property when it is no longer reachable and clears it when nothing is', () => {
    expect(buildAccessMetadata({ property_id: 'gone' }, { properties: [P2], organizations: [], organizationProperties: [] }))
      .toMatchObject({ property_id: 'p2', property_slug: 'tower-2' })
    expect(buildAccessMetadata({ property_id: 'p1' }, { properties: [], organizations: [], organizationProperties: [] }))
      .toMatchObject({ property_ids: [], org_ids: [], property_id: null, property_slug: null })
  })

  it('keeps other keys, drops the meaningless superadmin role and removes duplicates', () => {
    const meta = buildAccessMetadata(
      { role: 'superadmin', terminated_property_ids: ['p9'] },
      { properties: [P1, P1], organizations: [ORG, ORG], organizationProperties: [] }
    )
    expect(meta.role).toBeUndefined()
    expect(meta.terminated_property_ids).toEqual(['p9'])
    expect(meta.property_ids).toEqual(['p1'])
    expect(meta.org_ids).toEqual(['o1'])
  })
})

describe('homePath (middleware)', () => {
  it('sends Platform Admin to organizations, Org Admins to their organization, members to a property', () => {
    expect(homePath({ role: 'provider' })).toBe('/provider/organizations')
    expect(homePath({ org_slugs: ['acme'], property_slugs: ['tower-1'] })).toBe('/org/acme')
    expect(homePath({ property_slugs: ['tower-1', 'tower-2'], property_slug: 'tower-2' })).toBe('/tower-2')
    expect(homePath({ property_slugs: ['tower-1'], property_slug: 'elsewhere' })).toBe('/tower-1')
    expect(homePath({ property_slug: 'legacy' })).toBe('/legacy')
    expect(homePath({ property_slugs: [] })).toBeNull()
  })
})

describe('reserved slugs', () => {
  it('reserves top-level routes, including the org portal and page names', () => {
    for (const slug of ['org', 'provider', 'login', 'new', 'api', 'invite', 'suspended']) {
      expect(isReservedSlug(slug)).toBe(true)
      expect(slugError(slug)).toMatch(/reserved/)
    }
    expect(slugError('tower-1')).toBeNull()
  })

  it('validates the slug format', () => {
    expect(slugError('')).toMatch(/required/)
    expect(slugError('-tower')).toMatch(/lowercase/)
    expect(slugError('Tower')).toMatch(/lowercase/)
    expect(slugError('a'.repeat(64))).toMatch(/lowercase/)
  })

  it('suggests slugs from names', () => {
    expect(slugify('BGC Tower 3')).toBe('bgc-tower-3')
    expect(slugify('  Ayala -- Land  ')).toBe('ayala-land')
    expect(slugify('Ñandú & Co.')).toBe('and-co')
  })
})
