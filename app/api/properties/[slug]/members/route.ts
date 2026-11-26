import { NextRequest, NextResponse } from 'next/server'
import { canAssignRole, canManageMemberRole } from '@/lib/authz/escalation'
import { PROPERTY_ROLE_COLUMNS, parsePropertyRole } from '@/lib/authz/property-role'
import { authorizeForSlug, requireSession, type Service } from '@/lib/authz/guard'
import { countActiveAdministrators, loadRole } from '@/lib/property-roles'
import { syncUserAccess } from '@/lib/auth-users'

interface Params {
  params: Promise<{ slug: string }>
}

const ORG_MANAGED_ERROR =
  'This Administrator comes from the organization. Change their access from the organization’s administrators.'
const LAST_ADMIN_ERROR = 'The property must keep at least one active Administrator.'

/** Member management for the property in the URL: roles with `members.manage`, within the escalation rules. */
async function memberManager(params: Params['params']) {
  const { slug } = await params
  const session = await requireSession()
  if (!session.ok) return { error: session.response } as const

  const access = await authorizeForSlug(session, slug, 'members.manage')
  if (!access.ok) return { error: access.response } as const

  return { user: session.user, propertyId: access.propertyId, service: session.service, actor: access.actor } as const
}

async function loadTarget(service: Service, propertyId: string, id: string) {
  const { data } = await service
    .from('engineers')
    .select(`id, user_id, is_active, org_member_id, property_role:property_roles(${PROPERTY_ROLE_COLUMNS})`)
    .eq('id', id)
    .eq('property_id', propertyId)
    .maybeSingle()
  if (!data) return null
  return {
    id: data.id as string,
    userId: data.user_id as string | null,
    isActive: data.is_active !== false,
    role: parsePropertyRole(data.property_role),
    // Org-managed Administrator rows are changed from the organization (D30)
    orgManaged: Boolean(data.org_member_id),
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await memberManager(params)
  if ('error' in ctx) return ctx.error
  const { propertyId, service, actor } = ctx

  const body = await request.json().catch(() => ({})) as {
    full_name?: string
    email?: string
    phone?: string
    property_role_id?: string
    certifications?: string
  }

  if (!body.full_name?.trim()) {
    return NextResponse.json({ error: 'Full name is required.' }, { status: 400 })
  }
  if (!body.email?.trim()) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  }

  const role = await loadRole(service, propertyId, body.property_role_id)
  if (!role) return NextResponse.json({ error: 'Select a role of this property.' }, { status: 400 })
  if (!canAssignRole(actor, role)) {
    return NextResponse.json({ error: 'You cannot give this role.' }, { status: 403 })
  }

  const { data: dupe } = await service
    .from('engineers')
    .select('id')
    .eq('property_id', propertyId)
    .eq('email', body.email.trim().toLowerCase())
    .maybeSingle()

  if (dupe) {
    return NextResponse.json({ error: 'A member with this email already exists in this property.' }, { status: 409 })
  }

  // Tenant-portal members start without a company until linked on Floors & Tenants (D19)
  const { data, error } = await service.from('engineers').insert({
    property_id: propertyId,
    full_name: body.full_name.trim(),
    email: body.email.trim().toLowerCase(),
    phone: body.phone?.trim() || null,
    property_role_id: role.id,
    certifications: body.certifications?.trim() || null,
    is_active: true,
  }).select('id').single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: data.id }, { status: 201 })
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await memberManager(params)
  if ('error' in ctx) return ctx.error
  const { user, propertyId, service, actor } = ctx

  const body = await request.json().catch(() => ({})) as {
    id?: string
    property_role_id?: string
    is_active?: boolean
    phone?: string
    certifications?: string
  }

  if (!body.id) return NextResponse.json({ error: 'Member id is required.' }, { status: 400 })

  const target = await loadTarget(service, propertyId, body.id)
  if (!target) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })

  if (!canManageMemberRole(actor, target.role)) {
    return NextResponse.json({ error: 'You cannot manage members with this role.' }, { status: 403 })
  }

  const isSelf = target.userId === user.id
  const updates: Record<string, unknown> = {}

  const roleChanges = body.property_role_id !== undefined && body.property_role_id !== target.role?.id
  const activeChanges = body.is_active !== undefined && body.is_active !== target.isActive
  if (target.orgManaged && (roleChanges || activeChanges)) {
    return NextResponse.json({ error: ORG_MANAGED_ERROR }, { status: 409 })
  }

  let nextRole = target.role
  if (roleChanges) {
    if (isSelf) return NextResponse.json({ error: 'You cannot change your own role.' }, { status: 403 })
    const role = await loadRole(service, propertyId, body.property_role_id)
    if (!role) return NextResponse.json({ error: 'Select a role of this property.' }, { status: 400 })
    if (!canAssignRole(actor, role)) {
      return NextResponse.json({ error: 'You cannot give this role.' }, { status: 403 })
    }
    updates.property_role_id = role.id
    // Only tenant-portal members belong to a company
    if (role.portal !== 'tenant') updates.company_id = null
    nextRole = role
  }
  if (activeChanges) {
    if (typeof body.is_active !== 'boolean') return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
    if (isSelf && body.is_active === false) {
      return NextResponse.json({ error: 'You cannot deactivate your own account.' }, { status: 403 })
    }
    updates.is_active = body.is_active
  }

  // Demoting or deactivating an active Administrator must leave another one (org-managed rows count)
  const losesAdministrator = target.role?.isLocked && target.isActive &&
    (!nextRole?.isLocked || updates.is_active === false)
  if (losesAdministrator && (await countActiveAdministrators(service, propertyId, target.id)) === 0) {
    return NextResponse.json({ error: LAST_ADMIN_ERROR }, { status: 409 })
  }

  if (body.phone !== undefined) updates.phone = body.phone?.trim() || null
  if (body.certifications !== undefined) updates.certifications = body.certifications?.trim() || null

  if (Object.keys(updates).length === 0) return NextResponse.json({ success: true })

  const { error } = await service.from('engineers').update(updates).eq('id', target.id).eq('property_id', propertyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const ctx = await memberManager(params)
  if ('error' in ctx) return ctx.error
  const { user, propertyId, service, actor } = ctx

  const body = await request.json().catch(() => ({})) as { id?: string }
  if (!body.id) return NextResponse.json({ error: 'Member id is required.' }, { status: 400 })

  const target = await loadTarget(service, propertyId, body.id)
  if (!target) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
  if (target.userId === user.id) {
    return NextResponse.json({ error: 'You cannot remove yourself.' }, { status: 403 })
  }
  if (target.orgManaged) return NextResponse.json({ error: ORG_MANAGED_ERROR }, { status: 409 })
  if (!canManageMemberRole(actor, target.role)) {
    return NextResponse.json({ error: 'You cannot manage members with this role.' }, { status: 403 })
  }
  if (target.role?.isLocked && target.isActive && (await countActiveAdministrators(service, propertyId, target.id)) === 0) {
    return NextResponse.json({ error: LAST_ADMIN_ERROR }, { status: 409 })
  }

  const { error } = await service.from('engineers').delete().eq('id', target.id).eq('property_id', propertyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Rebuild the removed user's access lists from their remaining rows
  if (target.userId) await syncUserAccess(service, target.userId)

  return NextResponse.json({ success: true })
}
