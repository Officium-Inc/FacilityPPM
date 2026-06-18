import type { SupabaseClient } from '@supabase/supabase-js'

export const ROLE_ORDER = [
  'admin',
  'property_manager',
  'head_engineer',
  'service group',
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
  admin: 'Admin',
  property_manager: 'Property Manager',
  head_engineer: 'Head Engineer',
  'service group': 'Service Group',
  tenant: 'Tenant',
  viewer: 'Viewer',
}

const ROLE_ALIASES: Record<string, CanonicalRoleName> = {
  admin: 'admin',
  administrator: 'admin',
  'property manager': 'property_manager',
  'head engineer': 'head_engineer',
  engineer: 'head_engineer',
  'service group': 'service group',
  tenant: 'tenant',
  viewer: 'viewer',
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
  const normalized = normalizeRoleName(roleName)
  return ROLE_LABELS[normalized as CanonicalRoleName] ?? toTitleCase(normalized)
}

export function getRoleOptions(_roles: Array<{ name: string }> = []): RoleOption[] {
  return ROLE_ORDER.map((value) => ({ value, label: formatRoleName(value) }))
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

export async function resolveCanonicalRoleId(
  service: SupabaseClient,
  roleName?: string | null
): Promise<string | null> {
  const normalizedRoleName = normalizeRoleName(roleName)
  if (!isCanonicalRoleName(normalizedRoleName)) return null

  const { data: existing } = await service
    .from('roles')
    .select('id')
    .eq('name', normalizedRoleName)
    .maybeSingle()

  if (existing) return existing.id

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
