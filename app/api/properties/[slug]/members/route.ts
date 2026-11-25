import { NextRequest, NextResponse } from 'next/server'
import { resolveCanonicalRoleId, roleNameFromRelation } from '@/lib/roles'
import { assignableRoles, canManageMember, toPropertyRole } from '@/lib/authz/permissions'
import { authorizeForSlug, requireSession, type Service } from '@/lib/authz/guard'
import { syncUserAccess } from '@/lib/auth-users'

interface Params {
  params: Promise<{ slug: string }>
}

const ORG_MANAGED_ERROR =
  'This Administrator comes from the organization. Change their access from the organization’s administrators.'

/** Member management for the property in the URL: Administrators and Property Managers (D6). */
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
    .select('id, user_id, org_member_id, roles(name)')
    .eq('id', id)
    .eq('property_id', propertyId)
    .maybeSingle()
  if (!data) return null
  return {
    id: data.id as string,
    userId: data.user_id as string | null,
    role: roleNameFromRelation(data.roles),
    // Org-managed Administrator rows are changed from the organization (D30)
    orgManaged: Boolean(data.org_member_id),
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await memberManager(params)
  if ('error' in ctx) return ctx.error
  const { propertyId, service, actor } = ctx

  const body = await request.json() as {
    full_name?: string
    email?: string
    phone?: string
    role_name?: string
    certifications?: string
  }

  if (!body.full_name?.trim()) {
    return NextResponse.json({ error: 'Full name is required.' }, { status: 400 })
  }
  if (!body.email?.trim()) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  }

  const role = toPropertyRole(body.role_name)
  if (!role || !assignableRoles(actor).includes(role)) {
    return NextResponse.json({ error: 'You cannot assign this role.' }, { status: 403 })
  }

  // Check duplicate within this property
  const { data: dupe } = await service
    .from('engineers')
    .select('id')
    .eq('property_id', propertyId)
    .eq('email', body.email.trim().toLowerCase())
    .maybeSingle()

  if (dupe) {
    return NextResponse.json({ error: 'A member with this email already exists in this property.' }, { status: 409 })
  }

  const roleId = await resolveCanonicalRoleId(service, role)
  if (!roleId) return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })

  const { data, error } = await service.from('engineers').insert({
    property_id: propertyId,
    full_name: body.full_name.trim(),
    email: body.email.trim().toLowerCase(),
    phone: body.phone?.trim() || null,
    role_id: roleId,
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

  const body = await request.json() as {
    id?: string
    role_name?: string
    is_active?: boolean
    phone?: string
    certifications?: string
  }

  if (!body.id) return NextResponse.json({ error: 'Member id is required.' }, { status: 400 })

  const target = await loadTarget(service, propertyId, body.id)
  if (!target) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })

  if (!canManageMember(actor, target.role)) {
    return NextResponse.json({ error: 'You cannot manage members with this role.' }, { status: 403 })
  }

  const isSelf = target.userId === user.id
  const updates: Record<string, unknown> = {}

  const changesAccess = (body.role_name !== undefined && toPropertyRole(body.role_name) !== toPropertyRole(target.role)) ||
    body.is_active !== undefined
  if (target.orgManaged && changesAccess) {
    return NextResponse.json({ error: ORG_MANAGED_ERROR }, { status: 409 })
  }

  if (body.role_name !== undefined) {
    const role = toPropertyRole(body.role_name)
    if (role !== toPropertyRole(target.role)) {
      if (isSelf) return NextResponse.json({ error: 'You cannot change your own role.' }, { status: 403 })
      if (!role || !assignableRoles(actor).includes(role)) {
        return NextResponse.json({ error: 'You cannot assign this role.' }, { status: 403 })
      }
      const roleId = await resolveCanonicalRoleId(service, role)
      if (!roleId) return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
      updates.role_id = roleId
      // Only tenant members belong to a company
      if (role !== 'tenant') updates.company_id = null
    }
  }
  if (body.is_active !== undefined) {
    if (isSelf && body.is_active === false) {
      return NextResponse.json({ error: 'You cannot deactivate your own account.' }, { status: 403 })
    }
    updates.is_active = body.is_active
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
  if (!canManageMember(actor, target.role)) {
    return NextResponse.json({ error: 'You cannot manage members with this role.' }, { status: 403 })
  }

  const { error } = await service.from('engineers').delete().eq('id', target.id).eq('property_id', propertyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Rebuild the removed user's access lists from their remaining rows
  if (target.userId) await syncUserAccess(service, target.userId)

  return NextResponse.json({ success: true })
}
