/**
 * Role labels for display. Roles themselves are per-property records (`property_roles`, lib/authz/property-role.ts);
 * this file only turns stored role strings into labels: the role names snapshotted in work order history
 * (`work_order_events.actor_role`, `approval_trail.actor_role`, `work_order_comments.author_role`) and the old
 * machine keys stored before custom roles (D32). Client-safe.
 */

/** The old fixed role keys. `viewer` is retired (D1): it is only kept so old rows display. */
const ROLE_ORDER = [
  'admin',
  'property_manager',
  'head_engineer',
  'service_group',
  'tenant',
  'viewer',
] as const

type CanonicalRoleName = (typeof ROLE_ORDER)[number]

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

/** The old machine key of a role name (`Head Engineer` → `head_engineer`), or the name itself. Used for colours. */
export function normalizeRoleName(roleName?: string | null) {
  if (!roleName?.trim()) return ''
  const trimmed = roleName.trim()
  return ROLE_ALIASES[roleKey(trimmed)] ?? trimmed
}

/**
 * A role for display. Stored machine keys (`head_engineer`, `tenant`, legacy `service group`, `provider`) get
 * their label; names people typed for custom roles (D32) are shown as typed, so "Engineer" stays "Engineer".
 */
export function formatRoleName(roleName?: string | null, fallback = '-') {
  if (!roleName?.trim()) return fallback
  if (roleName === 'provider') return 'Platform Admin'
  const trimmed = roleName.trim()
  if (!/^[a-z0-9 _-]+$/.test(trimmed)) return trimmed
  const normalized = normalizeRoleName(trimmed)
  return ROLE_LABELS[normalized as CanonicalRoleName] ?? toTitleCase(normalized)
}
