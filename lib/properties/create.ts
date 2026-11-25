import type { SupabaseClient } from '@supabase/supabase-js'
import { slugError } from '@/lib/reserved-slugs'
import { isPropertyType, type PropertyType } from '@/lib/property-types'
import { logProviderAction, type ProviderContext } from '@/lib/provider/accounts'
import { getOrgAccountStatus } from '@/lib/org/accounts'
import { provisionPropertyForOrganization } from '@/lib/org/provisioning'

/**
 * Creates a property inside an organization (D29/D30). Only Platform Admin creates properties; callers must
 * have passed `requireProvider()`. The property starts with the organization's license (mirrored, see
 * lib/org/accounts.ts) and every active Org Admin becomes its Administrator.
 */

type Service = SupabaseClient

export type CreatePropertyResult =
  | { ok: true; property: { id: string; slug: string; name: string; organization_id: string; property_type: PropertyType }; administrators: number }
  | { ok: false; status: number; error: string }

const fail = (status: number, error: string) => ({ ok: false as const, status, error })

export interface CreatePropertyInput {
  organizationId?: unknown
  name?: unknown
  slug?: unknown
  propertyType?: unknown
}

export async function createProperty(service: Service, input: CreatePropertyInput, ctx: ProviderContext): Promise<CreatePropertyResult> {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const slug = typeof input.slug === 'string' ? input.slug.trim().toLowerCase() : ''
  if (!name) return fail(400, 'Name is required.')
  if (name.length > 120) return fail(400, 'Name is too long.')
  const invalidSlug = slugError(slug)
  if (invalidSlug) return fail(400, invalidSlug)
  if (!isPropertyType(input.propertyType)) return fail(400, 'Choose the property type.')
  if (typeof input.organizationId !== 'string' || !input.organizationId) return fail(400, 'Choose the organization.')

  const { data: organization } = await service
    .from('organizations')
    .select('id, name, slug, license_status, license_expires_at')
    .eq('id', input.organizationId)
    .maybeSingle()
  if (!organization) return fail(404, 'Organization not found.')

  const account = await getOrgAccountStatus(service, organization.id as string)
  if (account.terminated) return fail(409, 'The organization is terminated. Reactivate it before adding properties.')

  const { data: property, error } = await service
    .from('properties')
    .insert({
      name,
      slug,
      organization_id: organization.id,
      property_type: input.propertyType,
      license_status: organization.license_status,
      license_expires_at: organization.license_expires_at ?? null,
    })
    .select('id, slug, name, organization_id, property_type')
    .single()

  if (error) {
    if (error.code === '23505') return fail(409, 'A property with this slug already exists.')
    return fail(500, error.message)
  }

  await logProviderAction(service, ctx, {
    propertyId: property.id as string,
    organizationId: organization.id as string,
    action: 'property.created',
    metadata: {
      name,
      slug,
      property_type: input.propertyType,
      organization_name: organization.name,
      license_status: organization.license_status,
      license_expires_at: organization.license_expires_at ?? null,
    },
  })

  const { provisioned } = await provisionPropertyForOrganization(service, {
    id: property.id as string,
    organization_id: organization.id as string,
  })

  return {
    ok: true,
    property: property as { id: string; slug: string; name: string; organization_id: string; property_type: PropertyType },
    administrators: provisioned,
  }
}
