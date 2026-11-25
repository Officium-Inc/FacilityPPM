import type { SupabaseClient, User } from '@supabase/supabase-js'
import { sendInviteEmail } from '@/lib/email'
import { generateLinkToken, hashToken } from '@/lib/token'
import { syncUserAccess } from '@/lib/auth-users'
import {
  assignableOrgRoles,
  canManageOrgMember,
  isOrgRole,
  leavesNoActiveOwner,
  type OrgActorLike,
  type OrgRole,
} from '@/lib/org/roles'
import { deprovisionOrgMember, provisionOrgMember } from '@/lib/org/provisioning'

/**
 * Org Admin invitations and memberships (D30), shared by the Platform Admin routes and the org portal routes.
 * Callers must have authorized the caller for the organization first (`requireProvider()` or `authorizeOrg()`);
 * the role rules (who may give or change the owner role, the last active owner) are applied here.
 */

type Service = SupabaseClient

export type OrgOpResult<T = object> = ({ ok: true } & T) | { ok: false; status: number; error: string }

const fail = (status: number, error: string) => ({ ok: false as const, status, error })

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Who is acting: Platform Admin or an Org Admin (with their member id, to stop self-changes). */
export interface OrgOpsContext {
  actor: OrgActorLike & { memberId?: string }
  userId: string
  email: string | null
  ip: string | null
}

export interface OrganizationRef {
  id: string
  name: string
}

interface OrgMemberRow {
  id: string
  organization_id: string
  user_id: string
  email: string
  full_name: string
  org_role: string
  is_active: boolean
}

/** Organization audit entries (`audit_log.organization_id`), with the actor's role. */
export async function logOrgAction(
  service: Service,
  ctx: Pick<OrgOpsContext, 'actor' | 'userId' | 'ip'>,
  entry: { organizationId: string; action: string; metadata?: Record<string, unknown>; entityType?: string; entityId?: string | null }
) {
  const actorRole = ctx.actor.kind === 'provider' ? 'provider' : `org_${ctx.actor.orgRole}`
  const { error } = await service.from('audit_log').insert({
    property_id: null,
    organization_id: entry.organizationId,
    user_id: ctx.userId,
    action: entry.action,
    entity_type: entry.entityType ?? 'organization',
    entity_id: entry.entityId ?? entry.organizationId,
    metadata: { ...entry.metadata, actor_role: actorRole },
    ip_address: ctx.ip,
  })
  if (error) console.error('[org] failed to write audit log:', error.message)
}

async function loadMembers(service: Service, organizationId: string) {
  const { data } = await service
    .from('organization_members')
    .select('id, organization_id, user_id, email, full_name, org_role, is_active')
    .eq('organization_id', organizationId)
  return (data ?? []) as OrgMemberRow[]
}

// ── Invitations ─────────────────────────────────────────────────────────────

export async function inviteOrgMember(
  service: Service,
  organization: OrganizationRef,
  input: { email?: unknown; name?: unknown; org_role?: unknown },
  ctx: OrgOpsContext
): Promise<OrgOpResult<{ inviteId: string }>> {
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  if (!EMAIL_PATTERN.test(email)) return fail(400, 'Enter a valid email address.')
  const orgRole: OrgRole = input.org_role === undefined ? 'admin' : (input.org_role as OrgRole)
  if (!isOrgRole(orgRole)) return fail(400, 'Select a valid organization role.')
  if (!assignableOrgRoles(ctx.actor).includes(orgRole)) return fail(403, 'You cannot invite members with this role.')
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 120) || null : null

  const { data: member } = await service
    .from('organization_members')
    .select('id')
    .eq('organization_id', organization.id)
    .eq('email', email)
    .maybeSingle()
  if (member) return fail(409, 'This person is already an administrator of the organization.')

  const { data: pending } = await service
    .from('organization_invitations')
    .select('id')
    .eq('organization_id', organization.id)
    .eq('email', email)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .limit(1)
    .maybeSingle()
  if (pending) return fail(409, 'A pending invitation for this email already exists.')

  // Only the token's hash is stored; the raw token goes in the email (D27)
  const token = generateLinkToken()
  const { data: invite, error } = await service
    .from('organization_invitations')
    .insert({
      organization_id: organization.id,
      email,
      invited_name: name,
      org_role: orgRole,
      token_hash: hashToken(token),
      invited_by: ctx.email,
    })
    .select('id')
    .single()
  if (error) return fail(500, error.message)

  try {
    await sendInviteEmail({
      toEmail: email,
      toName: name ?? undefined,
      propertyName: organization.name,
      token,
      invitedBy: ctx.actor.kind === 'provider' ? undefined : ctx.email ?? undefined,
      scope: 'organization',
    })
  } catch {
    await service.from('organization_invitations').delete().eq('id', invite.id)
    return fail(500, 'Failed to send the invitation email. Check the email configuration.')
  }

  await logOrgAction(service, ctx, {
    organizationId: organization.id,
    action: 'org_member.invited',
    entityType: 'organization_invitation',
    entityId: invite.id as string,
    metadata: { email, org_role: orgRole },
  })
  return { ok: true, inviteId: invite.id as string }
}

async function loadInvite(service: Service, organizationId: string, inviteId: string) {
  const { data } = await service
    .from('organization_invitations')
    .select('id, email, invited_name, org_role, used_at')
    .eq('id', inviteId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  return data as { id: string; email: string; invited_name: string | null; org_role: string; used_at: string | null } | null
}

export async function resendOrgInvite(
  service: Service,
  organization: OrganizationRef,
  inviteId: string,
  ctx: OrgOpsContext
): Promise<OrgOpResult<{ expires_at: string }>> {
  const invite = await loadInvite(service, organization.id, inviteId)
  if (!invite) return fail(404, 'Invitation not found.')
  if (invite.used_at) return fail(409, 'This invitation was already accepted.')
  if (!canManageOrgMember(ctx.actor, invite.org_role)) return fail(403, 'You cannot manage invitations for this role.')

  const token = generateLinkToken()
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString()
  const { error } = await service
    .from('organization_invitations')
    .update({ token_hash: hashToken(token), expires_at: expiresAt })
    .eq('id', invite.id)
    .eq('organization_id', organization.id)
    .is('used_at', null)
  if (error) return fail(500, error.message)

  try {
    await sendInviteEmail({
      toEmail: invite.email,
      toName: invite.invited_name ?? undefined,
      propertyName: organization.name,
      token,
      scope: 'organization',
    })
  } catch {
    return fail(500, 'Failed to send the invitation email.')
  }

  await logOrgAction(service, ctx, {
    organizationId: organization.id,
    action: 'org_member.invite_resent',
    entityType: 'organization_invitation',
    entityId: invite.id,
    metadata: { email: invite.email },
  })
  return { ok: true, expires_at: expiresAt }
}

export async function revokeOrgInvite(
  service: Service,
  organization: OrganizationRef,
  inviteId: string,
  ctx: OrgOpsContext
): Promise<OrgOpResult> {
  const invite = await loadInvite(service, organization.id, inviteId)
  if (!invite) return fail(404, 'Invitation not found.')
  if (!canManageOrgMember(ctx.actor, invite.org_role)) return fail(403, 'You cannot manage invitations for this role.')

  const { error } = await service
    .from('organization_invitations')
    .delete()
    .eq('id', invite.id)
    .eq('organization_id', organization.id)
  if (error) return fail(500, error.message)

  await logOrgAction(service, ctx, {
    organizationId: organization.id,
    action: 'org_member.invite_revoked',
    entityType: 'organization_invitation',
    entityId: invite.id,
    metadata: { email: invite.email },
  })
  return { ok: true }
}

// ── Members ─────────────────────────────────────────────────────────────────

function selfChange(ctx: OrgOpsContext, target: OrgMemberRow) {
  return ctx.actor.kind === 'org_member' && (ctx.actor.memberId === target.id || ctx.userId === target.user_id)
}

/** Changes an Org Admin's role and/or status; deactivation removes their Administrator rows, reactivation restores them. */
export async function updateOrgMember(
  service: Service,
  organization: OrganizationRef,
  memberId: string,
  change: { org_role?: unknown; is_active?: unknown },
  ctx: OrgOpsContext
): Promise<OrgOpResult> {
  const members = await loadMembers(service, organization.id)
  const target = members.find((member) => member.id === memberId)
  if (!target) return fail(404, 'Member not found.')
  if (!canManageOrgMember(ctx.actor, target.org_role)) return fail(403, 'You cannot manage this administrator.')
  if (selfChange(ctx, target)) return fail(403, 'You cannot change your own organization access.')

  const updates: { org_role?: OrgRole; is_active?: boolean } = {}
  if (change.org_role !== undefined && change.org_role !== target.org_role) {
    if (!isOrgRole(change.org_role)) return fail(400, 'Select a valid organization role.')
    if (!assignableOrgRoles(ctx.actor).includes(change.org_role)) return fail(403, 'You cannot assign this role.')
    updates.org_role = change.org_role
  }
  if (change.is_active !== undefined && change.is_active !== target.is_active) {
    if (typeof change.is_active !== 'boolean') return fail(400, 'Invalid status.')
    updates.is_active = change.is_active
  }
  if (Object.keys(updates).length === 0) return { ok: true }

  if (ctx.actor.kind !== 'provider' && leavesNoActiveOwner(members, target.id, updates)) {
    return fail(409, 'The organization must keep at least one active owner.')
  }

  const { error } = await service
    .from('organization_members')
    .update(updates)
    .eq('id', target.id)
    .eq('organization_id', organization.id)
  if (error) return fail(500, error.message)

  if (updates.is_active !== undefined) {
    const result = updates.is_active
      ? await provisionOrgMember(service, target)
      : await deprovisionOrgMember(service, target.id)
    if (result.errors.length) console.error('[org] Administrator rows not fully updated:', result.errors)
    await syncUserAccess(service, target.user_id)
  }

  await logOrgAction(service, ctx, {
    organizationId: organization.id,
    action: 'org_member.updated',
    entityType: 'organization_member',
    entityId: target.id,
    metadata: { email: target.email, ...updates },
  })
  return { ok: true }
}

/** Removes an Org Admin: their org-managed Administrator rows go first, then the membership. */
export async function removeOrgMember(
  service: Service,
  organization: OrganizationRef,
  memberId: string,
  ctx: OrgOpsContext
): Promise<OrgOpResult> {
  const members = await loadMembers(service, organization.id)
  const target = members.find((member) => member.id === memberId)
  if (!target) return fail(404, 'Member not found.')
  if (!canManageOrgMember(ctx.actor, target.org_role)) return fail(403, 'You cannot manage this administrator.')
  if (selfChange(ctx, target)) return fail(403, 'You cannot remove yourself from the organization.')
  if (ctx.actor.kind !== 'provider' && leavesNoActiveOwner(members, target.id, 'remove')) {
    return fail(409, 'The organization must keep at least one active owner.')
  }

  const deprovision = await deprovisionOrgMember(service, target.id)
  if (deprovision.errors.length) return fail(500, deprovision.errors[0])

  const { error } = await service
    .from('organization_members')
    .delete()
    .eq('id', target.id)
    .eq('organization_id', organization.id)
  if (error) return fail(500, error.message)

  await syncUserAccess(service, target.user_id)
  await logOrgAction(service, ctx, {
    organizationId: organization.id,
    action: 'org_member.removed',
    entityType: 'organization_member',
    entityId: target.id,
    metadata: { email: target.email },
  })
  return { ok: true }
}

/**
 * Accepting an organization invitation (the invitation is already claimed): creates or reactivates the
 * membership with the invited role, provisions the Administrator rows and syncs the user's access lists.
 */
export async function joinOrganization(
  service: Service,
  invite: { id: string; organization_id: string; email: string; org_role: string },
  user: Pick<User, 'id'>,
  fullName: string
): Promise<string | null> {
  const orgRole: OrgRole = isOrgRole(invite.org_role) ? invite.org_role : 'admin'
  const { data: member, error } = await service
    .from('organization_members')
    .upsert(
      {
        organization_id: invite.organization_id,
        user_id: user.id,
        email: invite.email,
        full_name: fullName,
        org_role: orgRole,
        is_active: true,
      },
      { onConflict: 'organization_id,user_id' }
    )
    .select('id, organization_id, user_id, email, full_name')
    .single()
  if (error || !member) return error?.message ?? 'Could not add you to the organization.'

  const provision = await provisionOrgMember(service, member as OrgMemberRow)
  if (provision.errors.length) console.error('[org] Administrator rows not fully provisioned:', provision.errors)

  const sync = await syncUserAccess(service, user.id)
  if (sync.error) return sync.error

  const { error: auditError } = await service.from('audit_log').insert({
    property_id: null,
    organization_id: invite.organization_id,
    user_id: user.id,
    action: 'org_member.joined',
    entity_type: 'organization_member',
    entity_id: member.id,
    metadata: { email: invite.email, org_role: orgRole, actor_role: `org_${orgRole}` },
  })
  if (auditError) console.error('[org] failed to write audit log:', auditError.message)
  return null
}
