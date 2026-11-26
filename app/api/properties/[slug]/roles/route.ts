import { NextRequest, NextResponse } from 'next/server'
import { authorizeForSlug, requireSession } from '@/lib/authz/guard'
import { actorRoleLabel } from '@/lib/authz/actor'
import { permissionEntries } from '@/lib/authz/catalog'
import { canEditRole } from '@/lib/authz/escalation'
import { parseRoleInput } from '@/lib/authz/role-input'
import { loadRole, logRoleChange } from '@/lib/property-roles'

interface Params {
  params: Promise<{ slug: string }>
}

/**
 * Creates a custom role (D32): name, portal (fixed afterwards), work type (D33) and permissions. Requires
 * `roles.manage`; anyone but an Administrator may only create roles with less access than their own.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params
  const session = await requireSession()
  if (!session.ok) return session.response
  const { service, user } = session

  const access = await authorizeForSlug(session, slug, 'roles.manage')
  if (!access.ok) return access.response
  const { actor, propertyId } = access

  const body = await request.json().catch(() => ({}))
  const input = parseRoleInput(body)
  if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 })

  if (!canEditRole(actor, { portal: input.portal, isLocked: false }, input.permissions)) {
    return NextResponse.json({ error: 'You can only create roles with less access than your own.' }, { status: 403 })
  }

  const { data: created, error } = await service
    .from('property_roles')
    .insert({
      property_id: propertyId,
      name: input.name,
      description: input.description,
      portal: input.portal,
      work_type: input.workType,
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'A role with this name already exists.' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const grants = permissionEntries(input.permissions).map(({ key, scope }) => ({
    role_id: created.id,
    property_id: propertyId,
    permission_key: key,
    scope,
  }))
  if (grants.length > 0) {
    const { error: grantError } = await service.from('property_role_permissions').insert(grants)
    if (grantError) {
      await service.from('property_roles').delete().eq('id', created.id).eq('property_id', propertyId)
      return NextResponse.json({ error: grantError.message }, { status: 500 })
    }
  }

  await logRoleChange(service, {
    propertyId,
    userId: user.id,
    actorRole: actorRoleLabel(actor),
    action: 'role.created',
    roleId: created.id as string,
    metadata: { name: input.name, portal: input.portal, work_type: input.workType, permissions: input.permissions },
  })

  const role = await loadRole(service, propertyId, created.id)
  return NextResponse.json({ role }, { status: 201 })
}
