import { NextRequest, NextResponse } from 'next/server'
import { authorizeForSlug, requireSession } from '@/lib/authz/guard'
import { actorRoleLabel } from '@/lib/authz/actor'
import { PERMISSION_KEYS, permissionEntries } from '@/lib/authz/catalog'
import { canDeleteRole, canEditRole } from '@/lib/authz/escalation'
import { parseRoleInput } from '@/lib/authz/role-input'
import { loadRole, logRoleChange } from '@/lib/property-roles'

interface Params {
  params: Promise<{ slug: string; roleId: string }>
}

const CONFLICT = 'This role was changed by someone else meanwhile. Reload the page and try again.'

/**
 * Edits a role: name, description, work type and permissions (the portal is fixed). Optimistic concurrency: the
 * request names the `updated_at` it was based on. The Administrator role and the editor's own role cannot be
 * edited; anyone but an Administrator may only keep the role below their own access.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { slug, roleId } = await params
  const session = await requireSession()
  if (!session.ok) return session.response
  const { service, user } = session

  const access = await authorizeForSlug(session, slug, 'roles.manage')
  if (!access.ok) return access.response
  const { actor, propertyId } = access

  const role = await loadRole(service, propertyId, roleId)
  if (!role) return NextResponse.json({ error: 'Role not found.' }, { status: 404 })
  if (role.isLocked) return NextResponse.json({ error: 'The Administrator role cannot be changed.' }, { status: 403 })
  if (actor.kind === 'member' && actor.roleId === role.id) {
    return NextResponse.json({ error: 'You cannot edit the role you hold.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  if (typeof body.updated_at !== 'string') {
    return NextResponse.json({ error: 'The role version is missing. Reload the page and try again.' }, { status: 400 })
  }
  if (role.updatedAt && body.updated_at !== role.updatedAt) return NextResponse.json({ error: CONFLICT }, { status: 409 })

  const input = parseRoleInput(body, role)
  if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 })

  if (!canEditRole(actor, role, input.permissions, role.permissions)) {
    return NextResponse.json({ error: 'You can only edit roles with less access than your own.' }, { status: 403 })
  }

  // Conditional on the version the editor saw, so two editors cannot overwrite each other silently
  const now = new Date().toISOString()
  const { data: updated, error } = await service
    .from('property_roles')
    .update({ name: input.name, description: input.description, work_type: input.workType, updated_at: now })
    .eq('id', role.id)
    .eq('property_id', propertyId)
    .eq('updated_at', body.updated_at)
    .select('id')
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'A role with this name already exists.' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!updated || updated.length === 0) return NextResponse.json({ error: CONFLICT }, { status: 409 })

  // New grants first (an upsert never widens beyond the union of the old and new role, both below the editor),
  // then remove the ones that were taken away
  const grants = permissionEntries(input.permissions).map(({ key, scope }) => ({
    role_id: role.id,
    property_id: propertyId,
    permission_key: key,
    scope,
  }))
  if (grants.length > 0) {
    const { error: upsertError } = await service
      .from('property_role_permissions')
      .upsert(grants, { onConflict: 'role_id,permission_key' })
    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }
  const removed = PERMISSION_KEYS.filter((key) => !input.permissions[key])
  if (removed.length > 0) {
    const { error: deleteError } = await service
      .from('property_role_permissions')
      .delete()
      .eq('role_id', role.id)
      .eq('property_id', propertyId)
      .in('permission_key', removed)
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  await logRoleChange(service, {
    propertyId,
    userId: user.id,
    actorRole: actorRoleLabel(actor),
    action: 'role.updated',
    roleId: role.id,
    metadata: {
      before: { name: role.name, work_type: role.workType, permissions: role.permissions },
      after: { name: input.name, work_type: input.workType, permissions: input.permissions },
    },
  })

  return NextResponse.json({ role: await loadRole(service, propertyId, role.id) })
}

/** Deletes a role that nobody holds and no pending invitation names (reassign them first). */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { slug, roleId } = await params
  const session = await requireSession()
  if (!session.ok) return session.response
  const { service, user } = session

  const access = await authorizeForSlug(session, slug, 'roles.manage')
  if (!access.ok) return access.response
  const { actor, propertyId } = access

  const role = await loadRole(service, propertyId, roleId)
  if (!role) return NextResponse.json({ error: 'Role not found.' }, { status: 404 })
  if (role.isLocked) return NextResponse.json({ error: 'The Administrator role cannot be deleted.' }, { status: 403 })
  if (!canDeleteRole(actor, role)) {
    return NextResponse.json({ error: 'You can only delete roles with less access than your own.' }, { status: 403 })
  }

  const [{ count: members }, { count: pending }] = await Promise.all([
    service.from('engineers').select('id', { count: 'exact', head: true }).eq('property_id', propertyId).eq('property_role_id', role.id),
    service
      .from('invitations')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', propertyId)
      .eq('property_role_id', role.id)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString()),
  ])
  if ((members ?? 0) > 0) {
    return NextResponse.json(
      { error: `${members} member${members === 1 ? ' still has' : 's still have'} this role. Give them another role first.` },
      { status: 409 }
    )
  }
  if ((pending ?? 0) > 0) {
    return NextResponse.json({ error: 'A pending invitation uses this role. Cancel it first.' }, { status: 409 })
  }

  // Used and expired invitations keep their role name for history; only the reference goes
  const { error: detachError } = await service
    .from('invitations')
    .update({ property_role_id: null })
    .eq('property_id', propertyId)
    .eq('property_role_id', role.id)
  if (detachError) return NextResponse.json({ error: detachError.message }, { status: 500 })

  const { error } = await service.from('property_roles').delete().eq('id', role.id).eq('property_id', propertyId)
  if (error) {
    if (error.code === '23503') return NextResponse.json({ error: 'This role is still in use. Reload and try again.' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logRoleChange(service, {
    propertyId,
    userId: user.id,
    actorRole: actorRoleLabel(actor),
    action: 'role.deleted',
    roleId: role.id,
    metadata: { name: role.name, portal: role.portal, work_type: role.workType, permissions: role.permissions },
  })

  return NextResponse.json({ success: true })
}
