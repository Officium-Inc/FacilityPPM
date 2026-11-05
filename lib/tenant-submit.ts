import { NextResponse } from 'next/server'
import { authorize, type Denied, type Session } from '@/lib/authz/guard'
import { activePropertyId, type MemberActor } from '@/lib/authz/actor'
import { toStoredFileUrl } from '@/lib/storage-urls'

export const SERVICE_REPORT_BUCKET = 'receipts'
export const MAX_SERVICE_REPORT_PHOTOS = 6

/**
 * Authorizes a tenant submitting a work request to the property `slug` (or their active property):
 * an active tenant member of that property.
 */
export async function authorizeTenantSubmit(
  session: Session,
  slug?: string
): Promise<{ ok: true; actor: MemberActor; propertyId: string; companyId: string } | Denied> {
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
  if (!access.ok) {
    if (access.response.status === 403) {
      const membership = await authorize(session, 'portal.tenant', { propertyId })
      if (membership.ok && membership.actor.kind === 'member' && !membership.actor.companyId) {
        return {
          ok: false,
          response: NextResponse.json(
            { error: "Your account isn't linked to a company yet. Contact your property administrator." },
            { status: 403 }
          ),
        }
      }
    }
    return access
  }
  if (access.actor.kind !== 'member' || !access.actor.companyId) {
    return { ok: false, response: NextResponse.json({ error: 'Only tenants can submit work requests.' }, { status: 403 }) }
  }

  return { ok: true, actor: access.actor, propertyId, companyId: access.actor.companyId }
}

export function serviceReportPhotoPrefix(propertyId: string) {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
  return `${base}/storage/v1/object/public/${SERVICE_REPORT_BUCKET}/service-reports/${propertyId}/`
}

/** Only accept photo URLs uploaded through the tenant upload endpoint for this property (stored form; file-route URLs accepted). */
export function sanitizeServiceReportPhotoUrls(value: unknown, propertyId: string): string[] {
  if (!Array.isArray(value)) return []
  const prefix = serviceReportPhotoPrefix(propertyId)
  return value
    .filter((url): url is string => typeof url === 'string')
    .map(toStoredFileUrl)
    .filter((url) => url.startsWith(prefix) && !url.includes('..'))
    .slice(0, MAX_SERVICE_REPORT_PHOTOS)
}
