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

export function formatRoleName(roleName?: string | null, fallback = '-') {
  if (!roleName?.trim()) return fallback
  const normalized = normalizeRoleName(roleName)
  return ROLE_LABELS[normalized as CanonicalRoleName] ?? toTitleCase(normalized)
}

export function getRoleOptions(roles: Array<{ name: string }> = []): RoleOption[] {
  const options = new Set<string>(ROLE_ORDER)

  for (const role of roles) {
    const normalized = normalizeRoleName(role.name)
    if (normalized) options.add(normalized)
  }

  return Array.from(options)
    .sort((a, b) => {
      const aIndex = ROLE_ORDER.indexOf(a as CanonicalRoleName)
      const bIndex = ROLE_ORDER.indexOf(b as CanonicalRoleName)

      if (aIndex !== -1 || bIndex !== -1) {
        return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) -
          (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex)
      }

      return formatRoleName(a).localeCompare(formatRoleName(b))
    })
    .map((value) => ({ value, label: formatRoleName(value) }))
}
