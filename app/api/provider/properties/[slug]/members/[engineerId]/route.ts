import { NextRequest, NextResponse } from 'next/server'
import { requireProvider, type Service } from '@/lib/authz/guard'
import { normalizeRoleName, resolveCanonicalRoleId } from '@/lib/roles'
import { logProviderAction, removePropertyFromUser, requestIp } from '@/lib/provider/accounts'

interface Params {
  params: Promise<{ slug: string; engineerId: string }>
}

/** The member row, only when it belongs to the property in the URL. */
async function loadMember(service: Service, slug: string, engineerId: string) {
  const { data: property } = await service.from('properties').select('id, slug').eq('slug', slug).maybeSingle()
  if (!property) return null
  const { data: member } = await service
    .from('engineers')
    .select('id, user_id, property_id, email, is_active, role_id, roles(name)')
    .eq('id', engineerId)
    .eq('property_id', property.id)
    .maybeSingle()
  return member ? { property, member } : null
}

// PATCH: Update a member's role or active status
export async function PATCH(request: NextRequest, { params }: Params) {
  const { slug, engineerId } = await params
  const provider = await requireProvider()
  if (!provider.ok) return provider.response
  const { service, user } = provider

  const body = await request.json().catch(() => ({})) as { role_id?: string | null; is_active?: boolean }

  const found = await loadMember(service, slug, engineerId)
  if (!found) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
  const { property, member } = found

  const updates: Record<string, unknown> = {}
  let roleName: string | null = null
  if (body.role_id !== undefined) {
    if (!body.role_id) return NextResponse.json({ error: 'Select a role.' }, { status: 400 })
    const { data: role } = await service.from('roles').select('name').eq('id', body.role_id).maybeSingle()
    roleName = normalizeRoleName(role?.name)
    // The retired viewer role grants no access (D1)
    const roleId = roleName && roleName !== 'viewer' ? await resolveCanonicalRoleId(service, roleName) : null
    if (!roleId) return NextResponse.json({ error: 'Select a valid role.' }, { status: 400 })
    updates.role_id = roleId
    // Only tenants belong to a company; a new tenant starts unlinked until an Administrator links them (D19)
    updates.company_id = null
  }
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
    updates.is_active = body.is_active
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }
  // Keep the company of a tenant whose role is unchanged
  if (roleName === 'tenant' && updates.role_id === member.role_id) delete updates.company_id

  const { error } = await service.from('engineers').update(updates).eq('id', member.id).eq('property_id', property.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logProviderAction(service, { userId: user.id, ip: requestIp(request) }, {
    propertyId: property.id,
    action: 'member.updated',
    entityType: 'engineer',
    entityId: member.id,
    metadata: {
      email: member.email,
      ...(roleName ? { role: roleName } : {}),
      ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
    },
  })

  return NextResponse.json({ success: true })
}

// DELETE: Remove a member from the property
export async function DELETE(request: NextRequest, { params }: Params) {
  const { slug, engineerId } = await params
  const provider = await requireProvider()
  if (!provider.ok) return provider.response
  const { service, user } = provider

  const found = await loadMember(service, slug, engineerId)
  if (!found) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
  const { property, member } = found

  if (member.user_id) await removePropertyFromUser(service, member.user_id, property)

  const { error } = await service.from('engineers').delete().eq('id', member.id).eq('property_id', property.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logProviderAction(service, { userId: user.id, ip: requestIp(request) }, {
    propertyId: property.id,
    action: 'member.removed',
    entityType: 'engineer',
    entityId: member.id,
    metadata: { email: member.email },
  })

  return NextResponse.json({ success: true })
}