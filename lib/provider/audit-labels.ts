import { licenseDateInput } from '@/lib/provider/license'

/** Human-readable lines for `audit_log` entries shown in the Provider Dashboard. */

export interface AuditLike {
  action: string
  metadata: Record<string, unknown> | null
}

export const LICENSE_HISTORY_ACTIONS = new Set([
  'property.created',
  'license.updated',
  'account.terminated',
  'account.reactivated',
  'organization.created',
  'organization.terminated',
  'organization.reactivated',
])

const ORG_ROLE_NAMES: Record<string, string> = { owner: 'Owner', admin: 'Org Admin' }

function orgRole(value: unknown) {
  return ORG_ROLE_NAMES[text(value) ?? ''] ?? 'Org Admin'
}

function text(value: unknown) {
  return typeof value === 'string' && value ? value : null
}

function expiry(value: unknown) {
  const date = licenseDateInput(text(value))
  return date ? `until ${date}` : 'no end date'
}

function licenseLabel(state: unknown) {
  const value = (state ?? {}) as { status?: unknown; expires_at?: unknown }
  return `${text(value.status) ?? 'unknown'} (${expiry(value.expires_at)})`
}

export function describeAuditEntry(entry: AuditLike): string {
  const m = entry.metadata ?? {}
  const email = text(m.email)
  switch (entry.action) {
    case 'property.created':
      if (text(m.organization_name)) {
        return `Property "${text(m.name) ?? ''}" created in ${m.organization_name}${text(m.property_type) ? ` (${m.property_type})` : ''}`
      }
      return `Account created with a ${text(m.license_status) ?? 'trial'} license (${expiry(m.license_expires_at)})${text(m.first_admin_email) ? `; first Administrator ${m.first_admin_email}` : ''}`
    case 'property.type_changed':
      return `Property type changed from ${text(m.from) ?? 'unknown'} to ${text(m.to) ?? 'unknown'}`
    case 'organization.created':
      return `Organization created with a ${text(m.license_status) ?? 'trial'} license (${expiry(m.license_expires_at)})${text(m.owner_email) ? `; first Owner ${m.owner_email}` : ''}`
    case 'organization.renamed':
      return `Organization renamed from "${text(m.from) ?? ''}" to "${text(m.to) ?? ''}"`
    case 'organization.updated':
      return 'Organization profile updated'
    case 'organization.terminated': {
      const properties = Array.isArray(m.property_ids) ? m.property_ids.length : 0
      return `Organization terminated: ${properties} propert${properties === 1 ? 'y' : 'ies'} terminated${m.backfilled ? ' (carried over from the property account)' : ''}${text(m.reason) ? ` — ${m.reason}` : ''}`
    }
    case 'organization.reactivated':
      return `Organization reactivated with a ${text(m.license_status) ?? 'active'} license; ${Number(m.properties_reactivated ?? 0)} propert${Number(m.properties_reactivated ?? 0) === 1 ? 'y' : 'ies'} restored`
    case 'organization.deleted':
      return `Organization "${text(m.name) ?? ''}" deleted`
    case 'org_member.invited':
      return `Invited ${email ?? 'an administrator'} as ${orgRole(m.org_role)}`
    case 'org_member.joined':
      return `${email ?? 'An administrator'} joined as ${orgRole(m.org_role)}`
    case 'org_member.updated': {
      const changes = [
        text(m.org_role) ? `role ${orgRole(m.org_role)}` : null,
        typeof m.is_active === 'boolean' ? (m.is_active ? 'activated' : 'deactivated') : null,
      ].filter(Boolean)
      return `Updated ${email ?? 'an administrator'}${changes.length ? `: ${changes.join(', ')}` : ''}`
    }
    case 'org_member.removed':
      return `Removed ${email ?? 'an administrator'} from the organization`
    case 'org_member.invite_revoked':
      return `Revoked the organization invitation for ${email ?? 'an administrator'}`
    case 'org_member.invite_resent':
      return `Resent the organization invitation to ${email ?? 'an administrator'}`
    case 'license.updated':
      return `License changed from ${licenseLabel(m.from)} to ${licenseLabel(m.to)}`
    case 'property.renamed':
      return `Renamed from "${text(m.from) ?? ''}" to "${text(m.to) ?? ''}"`
    case 'account.terminated': {
      const members = Array.isArray(m.deactivated_member_ids) ? m.deactivated_member_ids.length : 0
      const banned = Array.isArray(m.banned_user_ids) ? m.banned_user_ids.length : 0
      return `Account terminated: ${members} member${members === 1 ? '' : 's'} deactivated, ${banned} sign-in${banned === 1 ? '' : 's'} blocked${text(m.reason) ? ` — ${m.reason}` : ''}`
    }
    case 'account.reactivated':
      return `Account reactivated with a ${text(m.license_status) ?? 'active'} license; ${Number(m.reactivated_members ?? 0)} member(s) restored`
    case 'member.invited':
      return `Invited ${email ?? 'a member'} as ${text(m.role) ?? 'member'}`
    case 'member.added':
      return `Added ${email ?? 'a member'} as ${text(m.role) ?? 'member'}`
    case 'member.updated': {
      const changes = [
        text(m.role) ? `role ${m.role}` : null,
        typeof m.is_active === 'boolean' ? (m.is_active ? 'activated' : 'deactivated') : null,
      ].filter(Boolean)
      return `Updated ${email ?? 'a member'}${changes.length ? `: ${changes.join(', ')}` : ''}`
    }
    case 'member.removed':
      return `Removed ${email ?? 'a member'} from the property`
    case 'member.invite_revoked':
      return `Revoked the invitation for ${email ?? 'a member'}`
    case 'member.invite_resent':
      return `Resent the invitation to ${email ?? 'a member'}`
    case 'work_order.signed':
      return `Work order signed off by ${text(m.signed_by) ?? 'the tenant'}`
    case 'work_order.rejected':
      return `Work order sign-off rejected${text(m.rejection_reason) ? `: ${m.rejection_reason}` : ''}`
    case 'work_order.sign_off_link_sent':
      return 'Sign-off link sent to the tenant'
    case 'support.viewed':
      return 'Platform Admin opened the read-only support view'
    default:
      return entry.action.replace(/[._]/g, ' ')
  }
}
