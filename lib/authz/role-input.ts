/**
 * Validation of role create/edit requests (D32, D33). Pure, shared by the Roles API and unit tests.
 */
import { isPortal, normalizePermissions, type Permissions, type Portal } from './catalog'
import { isWorkType, type WorkType } from './templates'

export interface RoleInput {
  name: string
  description: string | null
  portal: Portal
  workType: WorkType
  permissions: Permissions
}

export const ROLE_NAME_MAX = 60
export const ROLE_DESCRIPTION_MAX = 300

/**
 * Parses a role from a request body. `current` is the role being edited: its portal is fixed and fields that are
 * left out keep their value. Permissions are normalized (unknown keys and scopes dropped, implied keys added).
 */
export function parseRoleInput(
  body: unknown,
  current?: { name: string; description: string | null; portal: Portal; workType: WorkType; permissions: Permissions }
): RoleInput | { error: string } {
  const input = (body ?? {}) as Record<string, unknown>

  const rawName = input.name === undefined && current ? current.name : input.name
  const name = typeof rawName === 'string' ? rawName.trim().replace(/\s+/g, ' ') : ''
  if (!name) return { error: 'Give the role a name.' }
  if (name.length > ROLE_NAME_MAX) return { error: `Role names are at most ${ROLE_NAME_MAX} characters.` }

  const rawDescription = input.description === undefined && current ? current.description : input.description
  if (rawDescription !== null && rawDescription !== undefined && typeof rawDescription !== 'string') {
    return { error: 'Invalid description.' }
  }
  const description = typeof rawDescription === 'string' ? rawDescription.trim() || null : null
  if (description && description.length > ROLE_DESCRIPTION_MAX) {
    return { error: `Descriptions are at most ${ROLE_DESCRIPTION_MAX} characters.` }
  }

  let portal: Portal
  if (current) {
    if (input.portal !== undefined && input.portal !== current.portal) {
      return { error: 'A role’s portal cannot be changed. Create a new role instead.' }
    }
    portal = current.portal
  } else {
    if (!isPortal(input.portal)) return { error: 'Choose whether the role is for staff or for tenants.' }
    portal = input.portal
  }

  const rawWorkType = input.work_type === undefined ? (current?.workType ?? 'none') : input.work_type
  if (!isWorkType(rawWorkType)) return { error: 'Choose the work type: None, Engineer or Service Group.' }
  if (portal === 'tenant' && rawWorkType !== 'none') return { error: 'Tenant roles cannot be Engineers or Service Group.' }

  const permissions = input.permissions === undefined && current
    ? current.permissions
    : normalizePermissions(input.permissions, portal)

  return { name, description, portal, workType: rawWorkType, permissions }
}
