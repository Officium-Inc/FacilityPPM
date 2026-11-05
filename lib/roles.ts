import type { SupabaseClient } from '@supabase/supabase-js'

/** Canonical role names stored in `roles.name`. `viewer` is retired (D1): it is only kept so old rows display. */
export const ROLE_ORDER = [
  'admin',
  'property_manager',
  'head_engineer',
  'service_group',
  'tenant',
  'viewer',
] as const

export type CanonicalRoleName = (typeof ROLE_ORDER)[number]

export interface RoleOption {
  value: string
  label: string
}

export interface RoleRow {
  id: string
  name: string
}

const ROLE_LABELS: Record<CanonicalRoleName, string> = {
  admin: 'Administrator',
  property_manager: 'Property Manager',
  head_engineer: 'Head Engineer',
  service_group: 'Service Group',
  tenant: 'Tenant',
  viewer: 'Viewer (retired)',
}

/** Keys are role names lower-cased with `_`/`-` turned into spaces. */
const ROLE_ALIASES: Record<string, CanonicalRoleName> = {
  admin: 'admin',
  administrator: 'admin',
  'property manager': 'property_manager',
  'head engineer': 'head_engineer',
  engineer: 'head_engineer',
  'service group': 'service_group',
  tenant: 'tenant',
  viewer: 'viewer',
}

/** Names a canonical role may still have in databases where migration 020 has not run yet. */
const LEGACY_ROLE_NAMES: Partial<Record<CanonicalRoleName, string[]>> = {
  service_group: ['service group'],
}

function roleKey(roleName: string) {
  return roleName
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function toTitleCase(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

export function normalizeRoleName(roleName?: string | null) {
  if (!roleName?.trim()) return ''
  const trimmed = roleName.trim()
  return ROLE_ALIASES[roleKey(trimmed)] ?? trimmed
}

export function isCanonicalRoleName(roleName?: string | null): roleName is CanonicalRoleName {
  return ROLE_ORDER.includes(roleName as CanonicalRoleName)
}

export function formatRoleName(roleName?: string | null, fallback = '-') {
  if (!roleName?.trim()) return fallback
  if (roleName === 'provider') return 'Provider'
  const normalized = normalizeRoleName(roleName)
  return ROLE_LABELS[normalized as CanonicalRoleName] ?? toTitleCase(normalized)
}

/** Reads `roles(name)` from an embedded Supabase relation (object or single-element array). */
export function roleNameFromRelation(roles: unknown) {
  if (!roles) return ''
  const row = Array.isArray(roles) ? (roles[0] as { name?: string } | undefined) : (roles as { name?: string })
  return normalizeRoleName(row?.name)
}

export function roleOptions(roles: readonly string[]): RoleOption[] {
  return roles.map((value) => ({ value, label: formatRoleName(value) }))
}

export function getCanonicalRoleRows<T extends RoleRow>(roles: T[]) {
  const byName = new Map<CanonicalRoleName, T>()

  for (const role of roles) {
    const normalized = normalizeRoleName(role.name)
    if (!isCanonicalRoleName(normalized)) continue

    const current = byName.get(normalized)
    if (!current || role.name === normalized) {
      byName.set(normalized, role)
    }
  }

  return ROLE_ORDER
    .map((roleName) => byName.get(roleName))
    .filter((role): role is T => Boolean(role))
}

/** Returns the id of the canonical role row, creating it if it is missing. */
export async function resolveCanonicalRoleId(
  service: SupabaseClient,
  roleName?: string | null
): Promise<string | null> {
  const normalizedRoleName = normalizeRoleName(roleName)
  if (!isCanonicalRoleName(normalizedRoleName)) return null

  const names = [normalizedRoleName, ...(LEGACY_ROLE_NAMES[normalizedRoleName] ?? [])]
  const { data: existing } = await service
    .from('roles')
    .select('id, name')
    .in('name', names)

  const match = existing?.find((row) => row.name === normalizedRoleName) ?? existing?.[0]
  if (match) return match.id

  const { data: created, error } = await service
    .from('roles')
    .insert({ name: normalizedRoleName })
    .select('id')
    .single()

  if (!error) return created?.id ?? null

  const { data: racedExisting } = await service
    .from('roles')
    .select('id')
    .eq('name', normalizedRoleName)
    .maybeSingle()

  return racedExisting?.id ?? null
}
