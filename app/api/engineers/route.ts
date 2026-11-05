import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  MEMBER_MANAGER_ROLES,
  assignableRolesFor,
  canManageMemberRole,
  normalizeRoleName,
  resolveCanonicalRoleId,
} from '@/lib/roles'
import { authorizePropertyRole } from '@/lib/work-order-access'
import { revokePropertyAccess } from '@/lib/auth-users'

type Service = Awaited<ReturnType<typeof createServiceClient>>

async function memberManager() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const

  const propertyId = user.app_metadata?.property_id as string | undefined
  if (!propertyId) return { error: NextResponse.json({ error: 'No active property' }, { status: 400 }) } as const

  const service = await createServiceClient()
  const access = await authorizePropertyRole(service, user, propertyId, MEMBER_MANAGER_ROLES)
  if (!access.ok) return { error: NextResponse.json({ error: access.error }, { status: access.status }) } as const

  return { user, propertyId, service, actor: access.actor } as const
}

async function loadTarget(service: Service, propertyId: string, id: string) {
  const { data } = await service
    .from('engineers')
    .select('id, user_id, roles(name)')
    .eq('id', id)
    .eq('property_id', propertyId)
    .maybeSingle()
  if (!data) return null
  const roles = data.roles as { name?: string } | { name?: string }[] | null
  const roleName = Array.isArray(roles) ? roles[0]?.name : roles?.name
  return { id: data.id as string, userId: data.user_id as string | null, role: normalizeRoleName(roleName) }
}

export async function POST(request: NextRequest) {
  const ctx = await memberManager()
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

  const roleName = normalizeRoleName(body.role_name)
  if (!assignableRolesFor(actor.role).some((role) => role === roleName)) {
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
    return NextResponse.json({ error: 'An engineer with this email already exists in this property.' }, { status: 409 })
  }

  const roleId = await resolveCanonicalRoleId(service, roleName)
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

export async function PATCH(request: NextRequest) {
  const ctx = await memberManager()
  if ('error' in ctx) return ctx.error
  const { user, propertyId, service, actor } = ctx

  const body = await request.json() as {
    id?: string
    role_name?: string
    is_active?: boolean
    phone?: string
    certifications?: string
  }

  if (!body.id) return NextResponse.json({ error: 'Engineer id is required.' }, { status: 400 })

  const target = await loadTarget(service, propertyId, body.id)
  if (!target) return NextResponse.json({ error: 'Engineer not found.' }, { status: 404 })

  if (!canManageMemberRole(actor.role, target.role)) {
    return NextResponse.json({ error: 'You cannot manage members with this role.' }, { status: 403 })
  }

  const isSelf = target.userId === user.id
  const updates: Record<string, unknown> = {}

  if (body.role_name !== undefined) {
    const roleName = normalizeRoleName(body.role_name)
    if (roleName !== target.role) {
      if (isSelf) return NextResponse.json({ error: 'You cannot change your own role.' }, { status: 403 })
      if (!assignableRolesFor(actor.role).some((role) => role === roleName)) {
        return NextResponse.json({ error: 'You cannot assign this role.' }, { status: 403 })
      }
      const roleId = await resolveCanonicalRoleId(service, roleName)
      if (!roleId) return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
      updates.role_id = roleId
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

  const { error } = await service.from('engineers').update(updates).eq('id', target.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const ctx = await memberManager()
  if ('error' in ctx) return ctx.error
  const { user, propertyId, service, actor } = ctx

  const body = await request.json() as { id?: string }
  if (!body.id) return NextResponse.json({ error: 'Engineer id is required.' }, { status: 400 })

  const target = await loadTarget(service, propertyId, body.id)
  if (!target) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
  if (target.userId === user.id) {
    return NextResponse.json({ error: 'You cannot remove yourself.' }, { status: 403 })
  }
  if (!canManageMemberRole(actor.role, target.role)) {
    return NextResponse.json({ error: 'You cannot manage members with this role.' }, { status: 403 })
  }

  const { error } = await service.from('engineers').delete().eq('id', target.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (target.userId) await revokePropertyAccess(service, target.userId, propertyId)

  return NextResponse.json({ success: true })
}
