import { NextResponse } from 'next/server'
import { authorize, type Denied, type Session } from '@/lib/authz/guard'
import { activePropertyId, type MemberActor } from '@/lib/authz/actor'

export const SERVICE_REPORT_BUCKET = 'receipts'
export const MAX_SERVICE_REPORT_PHOTOS = 6

/**
 * Authorizes a tenant submitting a work request to the property `slug` (or their active property):
 * an active tenant member of that property.
 */
export async function authorizeTenantSubmit(
  session: Session,
  slug?: string
): Promise<{ ok: true; actor: MemberActor; propertyId: string } | Denied> {
  let propertyId = activePropertyId(session.user)

  if (slug) {
    const { data: property } = await session.service
      .from('properties')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    if (!property) return { ok: false, response: NextResponse.json({ error: 'Property not found.' }, { status: 404 }) }
    propertyId = property.id as string
  }

  if (!propertyId) {
    return { ok: false, response: NextResponse.json({ error: 'No active property.' }, { status: 400 }) }
  }

  const access = await authorize(session, 'workRequest.submit', { propertyId })
  if (!access.ok) return access
  if (access.actor.kind !== 'member') {
    return { ok: false, response: NextResponse.json({ error: 'Only tenants can submit work requests.' }, { status: 403 }) }
  }

  return { ok: true, actor: access.actor, propertyId }
}

export function serviceReportPhotoPrefix(propertyId: string) {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
  return `${base}/storage/v1/object/public/${SERVICE_REPORT_BUCKET}/service-reports/${propertyId}/`
}

/** Only accept photo URLs that were uploaded through the tenant upload endpoint for this property. */
export function sanitizeServiceReportPhotoUrls(value: unknown, propertyId: string): string[] {
  if (!Array.isArray(value)) return []
  const prefix = serviceReportPhotoPrefix(propertyId)
  return value
    .filter((url): url is string => typeof url === 'string' && url.startsWith(prefix) && !url.includes('..'))
    .slice(0, MAX_SERVICE_REPORT_PHOTOS)
}
