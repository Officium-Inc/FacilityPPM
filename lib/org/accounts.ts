import type { SupabaseClient } from '@supabase/supabase-js'
import { getAccountStatus } from '@/lib/provider/account-status'
import { isLicenseStatus, parseLicenseUpdate, type LicenseUpdate } from '@/lib/provider/license'
import { slugError } from '@/lib/reserved-slugs'
import {
  logProviderAction,
  reactivatePropertyAccount,
  terminatePropertyAccount,
  type ProviderContext,
} from '@/lib/provider/accounts'
import type { LicenseStatus } from '@/types'

/**
 * Organization accounts (D29). The license lives on the organization; every change is mirrored onto the
 * organization's properties so the effective license (most restrictive of both) stays the organization's,
 * and an app rolled back to the property-only license still sees the right state. Termination loops the
 * per-property termination (D23) over the organization's properties.
 * Callers must have passed `requireProvider()`.
 */

type Service = SupabaseClient

export type OrgResult<T = object> = ({ ok: true } & T) | { ok: false; status: number; error: string }

const fail = (status: number, error: string) => ({ ok: false as const, status, error })

export const ORG_ACCOUNT_ACTIONS = ['organization.terminated', 'organization.reactivated']

export interface OrganizationAccountRef {
  id: string
  slug: string
  name: string
  license_status: string
  license_expires_at?: string | null
}

export interface OrgAccountStatus {
  terminated: boolean
  terminatedAt: string | null
  reason: string | null
  previousLicenseStatus: LicenseStatus | null
}

/** Creates an organization with its license (D29); audit-logged as `organization.created`. */
export async function createOrganization(
  service: Service,
  input: { name?: unknown; slug?: unknown; license_status?: unknown; license_expires_at?: unknown; owner_email?: unknown },
  ctx: ProviderContext
): Promise<OrgResult<{ organization: OrganizationAccountRef }>> {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const slug = typeof input.slug === 'string' ? input.slug.trim().toLowerCase() : ''
  if (!name || name.length > 120) return fail(400, 'Name is required (up to 120 characters).')
  const invalidSlug = slugError(slug)
  if (invalidSlug) return fail(400, invalidSlug)

  const license = parseLicenseUpdate({
    license_status: input.license_status || 'trial',
    ...(input.license_expires_at ? { license_expires_at: input.license_expires_at } : {}),
  })
  if ('error' in license) return fail(400, license.error)

  const { data: organization, error } = await service
    .from('organizations')
    .insert({
      name,
      slug,
      license_status: license.license_status,
      license_expires_at: license.license_expires_at ?? null,
    })
    .select('id, slug, name, license_status, license_expires_at')
    .single()
  if (error) {
    if (error.code === '23505') return fail(409, 'An organization with this slug already exists.')
    return fail(500, error.message)
  }

  await logProviderAction(service, ctx, {
    propertyId: null,
    organizationId: organization.id as string,
    action: 'organization.created',
    entityType: 'organization',
    entityId: organization.id as string,
    metadata: {
      name,
      slug,
      license_status: license.license_status,
      license_expires_at: license.license_expires_at ?? null,
      owner_email: typeof input.owner_email === 'string' && input.owner_email.trim() ? input.owner_email.trim().toLowerCase() : null,
    },
  })
  return { ok: true, organization: organization as OrganizationAccountRef }
}

/** An organization is terminated when its latest organization account event is a termination. */
export async function getOrgAccountStatus(service: Service, organizationId: string): Promise<OrgAccountStatus> {
  const { data } = await service
    .from('audit_log')
    .select('action, metadata, created_at')
    .eq('organization_id', organizationId)
    .is('property_id', null)
    .in('action', ORG_ACCOUNT_ACTIONS)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data || data.action !== 'organization.terminated') {
    return { terminated: false, terminatedAt: null, reason: null, previousLicenseStatus: null }
  }
  const metadata = (data.metadata ?? {}) as Record<string, unknown>
  return {
    terminated: true,
    terminatedAt: data.created_at as string,
    reason: typeof metadata.reason === 'string' ? metadata.reason : null,
    previousLicenseStatus: isLicenseStatus(metadata.previous_license_status) ? metadata.previous_license_status : null,
  }
}

/** Ids of every terminated organization. */
export async function getTerminatedOrganizationIds(service: Service) {
  const { data } = await service
    .from('audit_log')
    .select('organization_id, action, created_at')
    .in('action', ORG_ACCOUNT_ACTIONS)
    .is('property_id', null)
    .not('organization_id', 'is', null)
    .order('created_at', { ascending: false })

  const seen = new Set<string>()
  const terminated = new Set<string>()
  for (const row of (data ?? []) as Array<{ organization_id: string; action: string }>) {
    if (seen.has(row.organization_id)) continue
    seen.add(row.organization_id)
    if (row.action === 'organization.terminated') terminated.add(row.organization_id)
  }
  return terminated
}

async function organizationProperties(service: Service, organizationId: string) {
  const { data } = await service
    .from('properties')
    .select('id, slug, name, license_status')
    .eq('organization_id', organizationId)
    .order('name')
  return (data ?? []) as Array<{ id: string; slug: string; name: string; license_status: string }>
}

/** Writes the organization's license onto its properties (see the module comment). */
async function mirrorLicense(service: Service, organizationId: string, license: { license_status: string; license_expires_at: string | null }) {
  const { error } = await service
    .from('properties')
    .update({ license_status: license.license_status, license_expires_at: license.license_expires_at })
    .eq('organization_id', organizationId)
  return error?.message ?? null
}

/** Changes the organization's license (status and/or expiry); audit-logged as `license.updated` (D17). */
export async function updateOrganizationLicense(
  service: Service,
  organization: OrganizationAccountRef,
  update: LicenseUpdate,
  ctx: ProviderContext
): Promise<OrgResult<{ changed: boolean }>> {
  const next = {
    license_status: update.license_status ?? organization.license_status,
    license_expires_at: update.license_expires_at !== undefined ? update.license_expires_at : organization.license_expires_at ?? null,
  }
  const changed = next.license_status !== organization.license_status ||
    (next.license_expires_at ?? null) !== (organization.license_expires_at ?? null)
  if (!changed) return { ok: true, changed: false }

  const status = await getOrgAccountStatus(service, organization.id)
  if (status.terminated) return fail(409, 'The organization is terminated. Reactivate it to change the license.')

  const { error } = await service
    .from('organizations')
    .update({ ...next, updated_at: new Date().toISOString() })
    .eq('id', organization.id)
  if (error) return fail(500, error.message)

  const mirrorError = await mirrorLicense(service, organization.id, next)
  if (mirrorError) return fail(500, mirrorError)

  await logProviderAction(service, ctx, {
    propertyId: null,
    organizationId: organization.id,
    action: 'license.updated',
    entityType: 'organization',
    entityId: organization.id,
    metadata: {
      from: { status: organization.license_status, expires_at: organization.license_expires_at ?? null },
      to: { status: next.license_status, expires_at: next.license_expires_at },
    },
  })
  return { ok: true, changed: true }
}

/**
 * Terminates an organization: suspends its license and terminates every property account that is not
 * terminated yet (D23: members deactivated, sign-in blocked for users without another active membership).
 */
export async function terminateOrganization(
  service: Service,
  organization: OrganizationAccountRef,
  ctx: ProviderContext,
  reason: string | null
): Promise<OrgResult<{ properties: number; deactivated: number; banned: number }>> {
  const status = await getOrgAccountStatus(service, organization.id)
  if (status.terminated) return fail(409, 'This organization is already terminated.')

  const { error } = await service
    .from('organizations')
    .update({ license_status: 'suspended', updated_at: new Date().toISOString() })
    .eq('id', organization.id)
  if (error) return fail(500, error.message)

  const terminatedPropertyIds: string[] = []
  let deactivated = 0
  let banned = 0
  for (const property of await organizationProperties(service, organization.id)) {
    const propertyStatus = await getAccountStatus(service, property.id)
    if (propertyStatus.terminated) continue
    const result = await terminatePropertyAccount(service, property, ctx, reason)
    if (!result.ok) return fail(result.status, `${property.name}: ${result.error}`)
    terminatedPropertyIds.push(property.id)
    deactivated += result.deactivated
    banned += result.banned
  }

  await logProviderAction(service, ctx, {
    propertyId: null,
    organizationId: organization.id,
    action: 'organization.terminated',
    entityType: 'organization',
    entityId: organization.id,
    metadata: {
      reason,
      previous_license_status: organization.license_status,
      property_ids: terminatedPropertyIds,
      deactivated_members: deactivated,
      banned_users: banned,
    },
  })

  return { ok: true, properties: terminatedPropertyIds.length, deactivated, banned }
}

/** Reverses a termination: restores the license and reactivates every terminated property of the organization. */
export async function reactivateOrganization(
  service: Service,
  organization: OrganizationAccountRef,
  ctx: ProviderContext,
  licenseStatus?: LicenseStatus
): Promise<OrgResult<{ properties: number; reactivated: number; license_status: LicenseStatus }>> {
  const status = await getOrgAccountStatus(service, organization.id)
  if (!status.terminated) return fail(409, 'This organization is not terminated.')

  const nextStatus: LicenseStatus = licenseStatus
    ?? (status.previousLicenseStatus && status.previousLicenseStatus !== 'suspended' ? status.previousLicenseStatus : 'active')

  const { error } = await service
    .from('organizations')
    .update({ license_status: nextStatus, updated_at: new Date().toISOString() })
    .eq('id', organization.id)
  if (error) return fail(500, error.message)

  let properties = 0
  let reactivated = 0
  for (const property of await organizationProperties(service, organization.id)) {
    const propertyStatus = await getAccountStatus(service, property.id)
    if (!propertyStatus.terminated) continue
    const result = await reactivatePropertyAccount(service, property, ctx, nextStatus)
    if (!result.ok) return fail(result.status, `${property.name}: ${result.error}`)
    properties++
    reactivated += result.reactivated
  }

  const mirrorError = await mirrorLicense(service, organization.id, {
    license_status: nextStatus,
    license_expires_at: organization.license_expires_at ?? null,
  })
  if (mirrorError) return fail(500, mirrorError)

  await logProviderAction(service, ctx, {
    propertyId: null,
    organizationId: organization.id,
    action: 'organization.reactivated',
    entityType: 'organization',
    entityId: organization.id,
    metadata: { license_status: nextStatus, properties_reactivated: properties, reactivated_members: reactivated },
  })

  return { ok: true, properties, reactivated, license_status: nextStatus }
}
