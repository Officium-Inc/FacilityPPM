import { cache } from 'react'
import { NextResponse } from 'next/server'
import { notFound, redirect } from 'next/navigation'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { can, type Action, type ScopedRecord } from './permissions'
import { activePropertyId, isProviderUser, resolveMembership, type Actor, type ProviderActor } from './actor'

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

export interface PropertyRow {
  id: string
  slug: string
  name: string
  license_status: string
  license_expires_at?: string | null
}

function deny(status: number, error: string): Denied {
  return { ok: false, response: NextResponse.json({ error }, { status }) }
}

/** Suspended licenses (and expired ones, once license_expires_at exists) lock members out of a property. */
export function isLicenseBlocked(property: Pick<PropertyRow, 'license_status' | 'license_expires_at'> | null) {
  if (!property) return true
  if (property.license_status === 'suspended') return true
  return Boolean(property.license_expires_at) && new Date(property.license_expires_at as string) < new Date()
}

async function loadProperty(service: Service, propertyId: string) {
  const { data } = await service
    .from('properties')
    .select('*')
    .eq('id', propertyId)
    .maybeSingle()
  return (data as PropertyRow | null) ?? null
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
 * scope are checked (a record outside the caller's property answers 404); otherwise `propertyId`, falling
 * back to the user's active property.
 */
export async function authorize(
  session: Session,
  action: Action,
  target: { propertyId?: string | null; record?: ScopedRecord } = {}
): Promise<Authorized | Denied> {
  const propertyId = target.record ? target.record.property_id : target.propertyId ?? activePropertyId(session.user)
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

/** Provider Dashboard routes. */
export async function requireProvider(): Promise<(Session & { actor: ProviderActor }) | Denied> {
  const session = await requireSession()
  if (!session.ok) return session
  if (!isProviderUser(session.user)) return deny(403, 'Provider access required.')
  return {
    ...session,
    actor: { kind: 'provider', userId: session.user.id, email: session.user.email ?? null, name: session.user.email ?? 'Provider' },
  }
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
  const { data } = await service.from('properties').select('*').eq('slug', slug).maybeSingle()
  return (data as PropertyRow | null) ?? null
})

const getMembership = cache(async (slug: string) => {
  const user = await getCurrentUser()
  const property = await getPropertyBySlug(slug)
  if (!user || !property) return null
  const service = await createServiceClient()
  const membership = await resolveMembership(service, user, property.id)
  return { user, property, service, membership }
})

/** Provider Dashboard pages: providers only (the middleware redirects too; this is the second check). */
export async function requireProviderPage(): Promise<{ user: User; service: Service; actor: ProviderActor }> {
  const user = await getCurrentUser()
  if (!user || !isProviderUser(user)) redirect('/provider/login')
  return {
    user,
    service: await createServiceClient(),
    actor: { kind: 'provider', userId: user.id, email: user.email ?? null, name: user.email ?? 'Provider' },
  }
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
    if (actor.kind === 'member' && actor.role === 'tenant') redirect(`/${slug}/tenant`)
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
