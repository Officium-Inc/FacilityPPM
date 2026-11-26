import { cache } from 'react'
import { NextResponse } from 'next/server'
import { notFound, redirect } from 'next/navigation'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { effectiveLicenseState, isBlockedLicenseState, licenseState, type LicenseFields } from '@/lib/provider/license'
import { canOrg, type OrgAction } from '@/lib/org/roles'
import { can, type Action, type ScopedRecord } from './permissions'
import {
  isProviderUser,
  resolveMembership,
  resolveOrgMembership,
  type Actor,
  type OrgActor,
  type ProviderActor,
} from './actor'

export type Service = SupabaseClient

export interface Session {
  ok: true
  user: User
  service: Service
}

export interface Denied {
  ok: false
  response: NextResponse
}

export interface Authorized {
  ok: true
  actor: Actor
}

export interface OrganizationLicense extends LicenseFields {
  id: string
  slug: string
  name: string
}

export interface PropertyRow {
  id: string
  slug: string
  name: string
  license_status: string
  license_expires_at?: string | null
  organization_id?: string | null
  property_type?: string | null
  /** The owning organization (license and identity), embedded by the guards. */
  organization?: OrganizationLicense | null
}

export interface OrganizationRow extends OrganizationLicense {
  legal_name: string | null
  contact_email: string | null
  contact_phone: string | null
  address: string | null
  city: string | null
  country: string | null
  website: string | null
  created_at: string
  updated_at: string
}

/** Columns of a property plus its organization's license, for every guard that checks the license. */
export const PROPERTY_WITH_ORGANIZATION = '*, organization:organizations(id, slug, name, license_status, license_expires_at)'

function deny(status: number, error: string): Denied {
  return { ok: false, response: NextResponse.json({ error }, { status }) }
}

function normalizeProperty(row: Record<string, unknown> | null): PropertyRow | null {
  if (!row) return null
  const organization = Array.isArray(row.organization) ? row.organization[0] ?? null : row.organization ?? null
  return { ...(row as unknown as PropertyRow), organization: organization as OrganizationLicense | null }
}

/**
 * Suspended or expired licenses lock members out of a property (D17). The organization's license and the
 * property's own both apply; the most restrictive wins (D29). A property of a missing organization fails closed.
 */
export function isLicenseBlocked(property: Pick<PropertyRow, 'license_status' | 'license_expires_at' | 'organization_id' | 'organization'> | null) {
  if (!property) return true
  const organization = property.organization_id ? property.organization ?? null : undefined
  return isBlockedLicenseState(effectiveLicenseState(organization, property))
}

export function isOrganizationLicenseBlocked(organization: LicenseFields | null) {
  return !organization || isBlockedLicenseState(licenseState(organization))
}

async function loadProperty(service: Service, propertyId: string) {
  const { data } = await service
    .from('properties')
    .select(PROPERTY_WITH_ORGANIZATION)
    .eq('id', propertyId)
    .maybeSingle()
  return normalizeProperty(data as Record<string, unknown> | null)
}

function providerActor(user: User): ProviderActor {
  return { kind: 'provider', userId: user.id, email: user.email ?? null, name: user.email ?? 'Platform Admin' }
}

// ── Route handlers ──────────────────────────────────────────────────────────

/** Authenticates the request (server-validated `getUser`) and returns a service client for later use. */
export async function requireSession(): Promise<Session | Denied> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return deny(401, 'Unauthorized')
  return { ok: true, user, service: await createServiceClient() }
}

/**
 * Authorizes `action` for the signed-in user. With a `record` the record's own property and the role's
 * scope are checked (a record outside the caller's property answers 404); otherwise the given `propertyId`.
 * There is no fallback to the "active property": routes name the property in the URL (`authorizeForSlug`).
 */
export async function authorize(
  session: Session,
  action: Action,
  target: { propertyId?: string | null; record?: ScopedRecord }
): Promise<Authorized | Denied> {
  const propertyId = target.record ? target.record.property_id : target.propertyId ?? null
  if (!propertyId && !target.record) return deny(400, 'No property selected.')
  const membership = await resolveMembership(session.service, session.user, propertyId)

  if (membership.status !== 'ok') {
    if (target.record) return deny(404, 'Not found.')
    return deny(403, membership.status === 'deactivated'
      ? 'Your account has been deactivated for this property.'
      : 'You do not have access to this property.')
  }

  const { actor } = membership
  if (actor.kind === 'member') {
    const property = await loadProperty(session.service, actor.propertyId)
    if (isLicenseBlocked(property)) return deny(403, 'This property is suspended.')
  }

  if (!can(actor, action, target.record)) return deny(403, 'Your role cannot perform this action.')
  return { ok: true, actor }
}

/** Authorizes `action` in the property identified by the route's `slug` (unknown slugs answer 404). */
export async function authorizeForSlug(
  session: Session,
  slug: string,
  action: Action
): Promise<(Authorized & { propertyId: string }) | Denied> {
  const { data: property } = await session.service.from('properties').select('id').eq('slug', slug).maybeSingle()
  if (!property) return deny(404, 'Property not found.')
  const access = await authorize(session, action, { propertyId: property.id as string })
  if (!access.ok) return access
  return { ...access, propertyId: property.id as string }
}

/** Platform Admin (Provider Dashboard) routes. */
export async function requireProvider(): Promise<(Session & { actor: ProviderActor }) | Denied> {
  const session = await requireSession()
  if (!session.ok) return session
  if (!isProviderUser(session.user)) return deny(403, 'Platform Admin access required.')
  return { ...session, actor: providerActor(session.user) }
}

async function loadOrganizationBySlug(service: Service, orgSlug: string) {
  const { data } = await service.from('organizations').select('*').eq('slug', orgSlug).maybeSingle()
  return (data as OrganizationRow | null) ?? null
}

/**
 * Org portal routes (`/api/org/[orgSlug]/…`): an active Org Admin of the organization, with a usable
 * organization license. Platform Admin manages organizations from its own dashboard and is read-only here.
 */
export async function authorizeOrg(
  session: Session,
  orgSlug: string,
  action: OrgAction
): Promise<{ ok: true; actor: OrgActor | ProviderActor; organization: OrganizationRow } | Denied> {
  const organization = await loadOrganizationBySlug(session.service, orgSlug)
  if (!organization) return deny(404, 'Organization not found.')

  const membership = await resolveOrgMembership(session.service, session.user, organization.id)
  if (membership.status !== 'ok') {
    return deny(403, membership.status === 'deactivated'
      ? 'Your organization access has been deactivated.'
      : 'You do not have access to this organization.')
  }
  const { actor } = membership
  if (actor.kind === 'org_member' && isOrganizationLicenseBlocked(organization)) {
    return deny(403, 'This organization is suspended.')
  }
  if (!canOrg(actor, action)) {
    return deny(403, actor.kind === 'provider'
      ? 'Platform Admin manages organizations from the Platform Admin dashboard.'
      : 'You cannot perform this action.')
  }
  return { ok: true, actor, organization }
}

// ── Server components (pages and layouts) ───────────────────────────────────

export interface PageContext {
  user: User
  service: Service
  property: PropertyRow
  actor: Actor
}

/** Per-request memo so a layout and its page resolve the user and property once. */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

export const getPropertyBySlug = cache(async (slug: string) => {
  const service = await createServiceClient()
  const { data } = await service.from('properties').select(PROPERTY_WITH_ORGANIZATION).eq('slug', slug).maybeSingle()
  return normalizeProperty(data as Record<string, unknown> | null)
})

export const getOrganizationBySlug = cache(async (orgSlug: string) => {
  const service = await createServiceClient()
  return loadOrganizationBySlug(service, orgSlug)
})

const getMembership = cache(async (slug: string) => {
  const user = await getCurrentUser()
  const property = await getPropertyBySlug(slug)
  if (!user || !property) return null
  const service = await createServiceClient()
  const membership = await resolveMembership(service, user, property.id)
  return { user, property, service, membership }
})

/** Platform Admin pages: providers only (the middleware redirects too; this is the second check). */
export async function requireProviderPage(): Promise<{ user: User; service: Service; actor: ProviderActor }> {
  const user = await getCurrentUser()
  if (!user || !isProviderUser(user)) redirect('/provider/login')
  return { user, service: await createServiceClient(), actor: providerActor(user) }
}

/**
 * Guards a page of the property identified by `slug`. Redirects to login, the suspended notice, the
 * user's portal or the sign-out page instead of rendering when the user may not perform `action`.
 */
export async function requirePage(slug: string, action: Action): Promise<PageContext> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const result = await getMembership(slug)
  if (!result) notFound()

  const { property, service, membership } = result
  if (membership.status !== 'ok') {
    redirect(`/api/auth/sign-out?next=/login&reason=${membership.status}`)
  }

  const { actor } = membership
  if (actor.kind === 'member' && isLicenseBlocked(property)) redirect(`/${slug}/suspended`)

  if (!can(actor, action)) {
    // Each portal has a page every member of it may open (portal.admin / portal.tenant), so this cannot loop
    if (actor.kind === 'member' && actor.portal === 'tenant') redirect(`/${slug}/tenant`)
    redirect(`/${slug}`)
  }

  return { user, service, property, actor }
}

/** Like requirePage, then applies the role's scope to one record; records the actor may not see are 404s. */
export async function requirePageRecord(
  slug: string,
  action: Action,
  record: ScopedRecord | null | undefined
): Promise<PageContext> {
  const context = await requirePage(slug, action)
  if (!record || record.property_id !== context.property.id || !can(context.actor, action, record)) notFound()
  return context
}

export interface OrgPageContext {
  user: User
  service: Service
  organization: OrganizationRow
  actor: OrgActor
}

/**
 * Guards an org portal page. Platform Admin is sent to the organization's page in its own dashboard,
 * deactivated Org Admins are signed out and a suspended or expired organization shows its notice.
 */
export async function requireOrgPage(orgSlug: string, action: OrgAction = 'org.view'): Promise<OrgPageContext> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (isProviderUser(user)) redirect(`/provider/organizations/${orgSlug}`)

  const organization = await getOrganizationBySlug(orgSlug)
  if (!organization) notFound()

  const service = await createServiceClient()
  const membership = await resolveOrgMembership(service, user, organization.id)
  if (membership.status === 'deactivated') redirect('/api/auth/sign-out?next=/login&reason=deactivated')
  if (membership.status !== 'ok' || membership.actor.kind !== 'org_member') notFound()

  if (isOrganizationLicenseBlocked(organization)) redirect(`/org/${orgSlug}/suspended`)
  if (!canOrg(membership.actor, action)) redirect(`/org/${orgSlug}`)

  return { user, service, organization, actor: membership.actor }
}
