import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveCanonicalRoleId } from '@/lib/roles'
import { syncUserAccess } from '@/lib/auth-users'

/**
 * Org-managed Administrator rows (D30). Every active Org Admin has an Administrator member row in every
 * property of the organization, marked with `engineers.org_member_id`:
 *   - the organization creates the row when the user had none (`org_restore` null), or
 *   - takes over the user's own row and keeps its previous state in `org_restore` ({ role_id, is_active,
 *     company_id }).
 * Deprovisioning restores taken-over rows and deletes the rows the organization created (every reference to a
 * member row is `on delete set null`, so history keeps its names and links). Call `syncUserAccess()` after.
 * Callers must have authorized the change; these functions use the service client.
 */

type Service = SupabaseClient

export interface OrgMemberRef {
  id: string
  organization_id: string
  user_id: string
  email: string
  full_name: string | null
}

interface MemberRow {
  id: string
  property_id: string
  role_id: string | null
  is_active: boolean
  company_id: string | null
  org_member_id: string | null
  org_restore: { role_id?: string | null; is_active?: boolean; company_id?: string | null } | null
}

/** Makes the Org Admin an Administrator in `propertyIds` (default: every property of the organization). */
export async function provisionOrgMember(
  service: Service,
  member: OrgMemberRef,
  propertyIds?: string[]
): Promise<{ errors: string[] }> {
  const adminRoleId = await resolveCanonicalRoleId(service, 'admin')
  if (!adminRoleId) return { errors: ['Could not resolve the Administrator role.'] }

  const ids = propertyIds ?? (
    (await service.from('properties').select('id').eq('organization_id', member.organization_id)).data ?? []
  ).map((row) => row.id as string)
  if (ids.length === 0) return { errors: [] }

  const { data: existing, error: loadError } = await service
    .from('engineers')
    .select('id, property_id, role_id, is_active, company_id, org_member_id, org_restore')
    .eq('user_id', member.user_id)
    .in('property_id', ids)
  if (loadError) return { errors: [loadError.message] }

  const byProperty = new Map(((existing ?? []) as MemberRow[]).map((row) => [row.property_id, row]))
  const errors: string[] = []

  for (const propertyId of ids) {
    const row = byProperty.get(propertyId)
    if (!row) {
      const { error } = await service.from('engineers').insert({
        property_id: propertyId,
        user_id: member.user_id,
        role_id: adminRoleId,
        full_name: member.full_name?.trim() || member.email,
        email: member.email,
        is_active: true,
        org_member_id: member.id,
      })
      if (error) errors.push(error.message)
      continue
    }

    if (row.org_member_id === member.id) {
      if (row.role_id === adminRoleId && row.is_active && !row.company_id) continue
      const { error } = await service
        .from('engineers')
        .update({ role_id: adminRoleId, is_active: true, company_id: null })
        .eq('id', row.id)
      if (error) errors.push(error.message)
      continue
    }

    // The user's own row: remember its state, then make it an org-managed Administrator row
    const restore = row.org_member_id && row.org_restore
      ? row.org_restore
      : { role_id: row.role_id, is_active: row.is_active, company_id: row.company_id }
    const { error } = await service
      .from('engineers')
      .update({ role_id: adminRoleId, is_active: true, company_id: null, org_member_id: member.id, org_restore: restore })
      .eq('id', row.id)
    if (error) errors.push(error.message)
  }

  return { errors }
}

/** Removes the Administrator rows that exist because of this Org Admin membership. */
export async function deprovisionOrgMember(service: Service, memberId: string): Promise<{ errors: string[] }> {
  const { data: rows, error: loadError } = await service
    .from('engineers')
    .select('id, property_id, org_restore')
    .eq('org_member_id', memberId)
  if (loadError) return { errors: [loadError.message] }

  const errors: string[] = []
  for (const row of (rows ?? []) as Array<Pick<MemberRow, 'id' | 'property_id' | 'org_restore'>>) {
    if (!row.org_restore) {
      const { error } = await service.from('engineers').delete().eq('id', row.id)
      if (error) errors.push(error.message)
      continue
    }
    const restore = {
      role_id: row.org_restore.role_id ?? null,
      is_active: row.org_restore.is_active ?? false,
      org_member_id: null,
      org_restore: null,
    }
    let { error } = await service
      .from('engineers')
      .update({ ...restore, company_id: row.org_restore.company_id ?? null })
      .eq('id', row.id)
    // The company may have been deleted meanwhile: restore the rest
    if (error) ({ error } = await service.from('engineers').update({ ...restore, company_id: null }).eq('id', row.id))
    if (error) errors.push(error.message)
  }
  return { errors }
}

/** A new property of an organization: every active Org Admin becomes an Administrator there. */
export async function provisionPropertyForOrganization(
  service: Service,
  property: { id: string; organization_id: string }
): Promise<{ provisioned: number; errors: string[] }> {
  const { data: members } = await service
    .from('organization_members')
    .select('id, organization_id, user_id, email, full_name')
    .eq('organization_id', property.organization_id)
    .eq('is_active', true)

  const errors: string[] = []
  let provisioned = 0
  for (const member of (members ?? []) as OrgMemberRef[]) {
    const result = await provisionOrgMember(service, member, [property.id])
    errors.push(...result.errors)
    if (result.errors.length === 0) provisioned++
    const sync = await syncUserAccess(service, member.user_id)
    if (sync.error) errors.push(sync.error)
  }
  if (errors.length) console.error('[org] provisioning a new property failed for some Org Admins:', errors)
  return { provisioned, errors }
}

/** Whether a member row is an org-managed Administrator row (it is managed from the organization). */
export function isOrgManagedRow(row: { org_member_id?: string | null } | null | undefined) {
  return Boolean(row?.org_member_id)
}
