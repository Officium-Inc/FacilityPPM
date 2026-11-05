import type { SupabaseClient, User } from '@supabase/supabase-js'
import { sendInviteEmail } from '@/lib/email'
import { generateLinkToken, hashToken } from '@/lib/token'
import { getAccountStatus } from '@/lib/provider/account-status'
import type { LicenseStatus } from '@/types'

/**
 * Provider account operations (D18). Callers must have passed `requireProvider()` first: every function
 * here uses the service client and touches a whole property.
 */

type Service = SupabaseClient

export type AccountResult<T = object> = ({ ok: true } & T) | { ok: false; status: number; error: string }

const fail = (status: number, error: string) => ({ ok: false as const, status, error })

/** Long enough to be permanent; reactivation lifts it with `ban_duration: 'none'`. */
const TERMINATION_BAN = '876000h'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface ProviderContext {
  userId: string
  ip: string | null
}

export function requestIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? request.headers.get('x-real-ip') ?? null
}

/** Provider actions go to `audit_log` so the property's activity shows who changed what. */
export async function logProviderAction(
  service: Service,
  ctx: ProviderContext,
  entry: { propertyId: string | null; action: string; metadata?: Record<string, unknown>; entityType?: string; entityId?: string | null }
) {
  const { error } = await service.from('audit_log').insert({
    property_id: entry.propertyId,
    user_id: ctx.userId,
    action: entry.action,
    entity_type: entry.entityType ?? 'property',
    entity_id: entry.entityId ?? entry.propertyId,
    metadata: { ...entry.metadata, actor_role: 'provider' },
    ip_address: ctx.ip,
  })
  if (error) console.error('[provider] failed to write audit log:', error.message)
}

// ── Administrator invitations ───────────────────────────────────────────────

/** Invites an Administrator into a property (provider invitations always create Administrators). */
export async function createAdminInvite(
  service: Service,
  property: { id: string; name: string },
  email: string,
  name?: string | null
): Promise<AccountResult> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!EMAIL_PATTERN.test(normalizedEmail)) return fail(400, 'Enter a valid email address.')

  const { data: existing } = await service
    .from('invitations')
    .select('id')
    .eq('property_id', property.id)
    .eq('email', normalizedEmail)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (existing) return fail(409, 'A pending invitation for this email already exists.')

  // Only the token's hash is stored; the raw token goes in the email
  const token = generateLinkToken()
  const { data: invite, error: inviteError } = await service
    .from('invitations')
    .insert({
      property_id: property.id,
      email: normalizedEmail,
      invited_name: name?.trim() || null,
      role_name: 'admin',
      token_hash: hashToken(token),
    })
    .select('id')
    .single()
  if (inviteError) return fail(500, inviteError.message)

  try {
    await sendInviteEmail({
      toEmail: normalizedEmail,
      toName: name?.trim() || undefined,
      propertyName: property.name,
      token,
    })
  } catch {
    await service.from('invitations').delete().eq('id', invite.id)
    return fail(500, 'Failed to send invitation email.')
  }

  return { ok: true }
}

// ── Terminate / reactivate ──────────────────────────────────────────────────

function terminatedPropertyIds(user: User) {
  const value = user.app_metadata?.terminated_property_ids
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
}

function isBanned(user: User) {
  const bannedUntil = (user as User & { banned_until?: string | null }).banned_until
  return Boolean(bannedUntil) && new Date(bannedUntil as string) > new Date()
}

async function memberUserIds(service: Service, propertyId: string) {
  const { data } = await service
    .from('engineers')
    .select('user_id')
    .eq('property_id', propertyId)
    .not('user_id', 'is', null)
  return [...new Set((data ?? []).map((row) => row.user_id as string))]
}

/**
 * Terminates a property account: suspends the license, deactivates every active member and bans the sign-in
 * of users who have no active membership in another property. Reversible with `reactivatePropertyAccount`.
 */
export async function terminatePropertyAccount(
  service: Service,
  property: { id: string; slug: string; license_status: string },
  ctx: ProviderContext,
  reason: string | null
): Promise<AccountResult<{ deactivated: number; banned: number }>> {
  const status = await getAccountStatus(service, property.id)
  if (status.terminated) return fail(409, 'This account is already terminated.')

  // Suspending first locks every member out of the property straight away
  const { error: licenseError } = await service.from('properties').update({ license_status: 'suspended' }).eq('id', property.id)
  if (licenseError) return fail(500, licenseError.message)

  const { data: deactivatedRows, error: memberError } = await service
    .from('engineers')
    .update({ is_active: false })
    .eq('property_id', property.id)
    .eq('is_active', true)
    .select('id')
  if (memberError) return fail(500, memberError.message)
  const deactivatedMemberIds = (deactivatedRows ?? []).map((row) => row.id as string)

  const bannedUserIds: string[] = []
  for (const userId of await memberUserIds(service, property.id)) {
    const { data: userData } = await service.auth.admin.getUserById(userId)
    const user = userData?.user
    if (!user || user.app_metadata?.role === 'provider') continue

    const { data: otherMembership } = await service
      .from('engineers')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .neq('property_id', property.id)
      .limit(1)
      .maybeSingle()

    const ban = !otherMembership
    const { error } = await service.auth.admin.updateUserById(userId, {
      app_metadata: {
        ...user.app_metadata,
        terminated_property_ids: [...new Set([...terminatedPropertyIds(user), property.id])],
      },
      ...(ban ? { ban_duration: TERMINATION_BAN } : {}),
    })
    if (error) console.error('[provider] failed to update user on termination:', error.message)
    else if (ban) bannedUserIds.push(userId)
  }

  await logProviderAction(service, ctx, {
    propertyId: property.id,
    action: 'account.terminated',
    metadata: {
      reason,
      previous_license_status: property.license_status,
      deactivated_member_ids: deactivatedMemberIds,
      banned_user_ids: bannedUserIds,
    },
  })

  return { ok: true, deactivated: deactivatedMemberIds.length, banned: bannedUserIds.length }
}

/** Reverses a termination: restores the license, the members deactivated by it and their sign-in. */
export async function reactivatePropertyAccount(
  service: Service,
  property: { id: string; slug: string },
  ctx: ProviderContext,
  licenseStatus?: LicenseStatus
): Promise<AccountResult<{ reactivated: number; license_status: LicenseStatus }>> {
  const status = await getAccountStatus(service, property.id)
  if (!status.terminated) return fail(409, 'This account is not terminated.')

  const nextStatus: LicenseStatus = licenseStatus
    ?? (status.previousLicenseStatus && status.previousLicenseStatus !== 'suspended' ? status.previousLicenseStatus : 'active')

  const { error: licenseError } = await service.from('properties').update({ license_status: nextStatus }).eq('id', property.id)
  if (licenseError) return fail(500, licenseError.message)

  let reactivated = 0
  if (status.deactivatedMemberIds.length > 0) {
    const { data, error } = await service
      .from('engineers')
      .update({ is_active: true })
      .eq('property_id', property.id)
      .in('id', status.deactivatedMemberIds)
      .select('id')
    if (error) return fail(500, error.message)
    reactivated = data?.length ?? 0
  }

  for (const userId of await memberUserIds(service, property.id)) {
    const { data: userData } = await service.auth.admin.getUserById(userId)
    const user = userData?.user
    if (!user) continue
    const terminated = terminatedPropertyIds(user)
    if (!terminated.includes(property.id)) continue

    const remaining = terminated.filter((id) => id !== property.id)
    const { error } = await service.auth.admin.updateUserById(userId, {
      app_metadata: { ...user.app_metadata, terminated_property_ids: remaining },
      // Still banned while another of their properties is terminated
      ...(remaining.length === 0 && isBanned(user) ? { ban_duration: 'none' } : {}),
    })
    if (error) console.error('[provider] failed to update user on reactivation:', error.message)
  }

  await logProviderAction(service, ctx, {
    propertyId: property.id,
    action: 'account.reactivated',
    metadata: { license_status: nextStatus, reactivated_members: reactivated },
  })

  return { ok: true, reactivated, license_status: nextStatus }
}

/**
 * Removes a property from a user's access lists (hard delete or member removal). A user banned only because
 * this property was terminated gets their sign-in back if they still belong to another property.
 */
export async function removePropertyFromUser(service: Service, userId: string, property: { id: string; slug: string }) {
  const { data: userData } = await service.auth.admin.getUserById(userId)
  const user = userData?.user
  if (!user) return

  const meta = user.app_metadata ?? {}
  const ids = ((meta.property_ids as string[] | undefined) ?? []).filter((id) => id !== property.id)
  const slugs = ((meta.property_slugs as string[] | undefined) ?? []).filter((slug) => slug !== property.slug)
  const terminated = terminatedPropertyIds(user)
  const remainingTerminated = terminated.filter((id) => id !== property.id)
  const liftBan = terminated.includes(property.id) && remainingTerminated.length === 0 && ids.length > 0 && isBanned(user)

  const { error } = await service.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...meta,
      property_ids: ids,
      property_slugs: slugs,
      property_id: meta.property_id === property.id ? ids[0] ?? null : meta.property_id ?? null,
      property_slug: meta.property_slug === property.slug ? slugs[0] ?? null : meta.property_slug ?? null,
      terminated_property_ids: remainingTerminated,
    },
    ...(liftBan ? { ban_duration: 'none' } : {}),
  })
  if (error) console.error('[provider] failed to remove property from user:', error.message)
}
