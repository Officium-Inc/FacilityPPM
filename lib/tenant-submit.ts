import type { SupabaseClient, User } from '@supabase/supabase-js'
import { normalizeRoleName } from '@/lib/roles'

export const SERVICE_REPORT_BUCKET = 'receipts'
export const MAX_SERVICE_REPORT_PHOTOS = 6

export interface TenantSubmitter {
  propertyId: string
  engineer: { id: string; full_name: string | null; email: string | null }
}

type SubmitterResult =
  | ({ ok: true } & TenantSubmitter)
  | { ok: false; status: number; error: string }

/** Validates that the signed-in user is an active tenant member of the property they are submitting to. */
export async function resolveTenantSubmitter(
  service: SupabaseClient,
  user: User,
  slug?: string
): Promise<SubmitterResult> {
  let propertyId = user.app_metadata?.property_id as string | undefined

  if (slug) {
    const userSlugs: string[] = (user.app_metadata?.property_slugs as string[] | undefined) ??
      (user.app_metadata?.property_slug ? [user.app_metadata.property_slug as string] : [])
    if (!userSlugs.includes(slug)) {
      return { ok: false, status: 403, error: 'Property access denied.' }
    }

    const { data: property } = await service
      .from('properties')
      .select('id')
      .eq('slug', slug)
      .single()

    if (!property) return { ok: false, status: 404, error: 'Property not found.' }
    propertyId = property.id
  }

  if (!propertyId) return { ok: false, status: 400, error: 'No active property.' }

  const { data: engineer } = await service
    .from('engineers')
    .select('id, full_name, email, is_active, roles(name)')
    .eq('property_id', propertyId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!engineer || engineer.is_active === false) {
    return { ok: false, status: 403, error: 'Tenant member not found.' }
  }

  const roles = engineer.roles as { name?: string } | { name?: string }[] | null
  const roleName = Array.isArray(roles) ? roles[0]?.name : roles?.name
  if (normalizeRoleName(roleName) !== 'tenant') {
    return { ok: false, status: 403, error: 'Only tenant users can submit tenant service reports.' }
  }

  return {
    ok: true,
    propertyId,
    engineer: { id: engineer.id, full_name: engineer.full_name, email: engineer.email },
  }
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
    .filter((url): url is string => typeof url === 'string' && url.startsWith(prefix))
    .slice(0, MAX_SERVICE_REPORT_PHOTOS)
}
