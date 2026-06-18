import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { resolveCanonicalRoleId } from '@/lib/roles'

interface Params {
  params: Promise<{ slug: string; engineerId: string }>
}

async function requireProvider() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== 'provider') return null
  return user
}

// PATCH: Update a member's role or active status
export async function PATCH(request: NextRequest, { params }: Params) {
  const { engineerId } = await params
  if (!await requireProvider()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { role_id, is_active } = body as { role_id?: string; is_active?: boolean }

  const service = await createServiceClient()
  const updates: Record<string, unknown> = {}
  if (role_id !== undefined) {
    if (role_id) {
      const { data: role } = await service
        .from('roles')
        .select('name')
        .eq('id', role_id)
        .maybeSingle()
      updates.role_id = await resolveCanonicalRoleId(service, role?.name)
    } else {
      updates.role_id = null
    }
  }
  if (is_active !== undefined) updates.is_active = is_active

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { error } = await service.from('engineers').update(updates).eq('id', engineerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE: Remove a member from the property
export async function DELETE(request: NextRequest, { params }: Params) {
  const { slug, engineerId } = await params
  if (!await requireProvider()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = await createServiceClient()

  // Get the engineer to find their user_id and property_id
  const { data: engineer } = await service
    .from('engineers')
    .select('user_id, property_id')
    .eq('id', engineerId)
    .single()

  if (!engineer) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })

  // Remove property from user's app_metadata if they have an auth account
  if (engineer.user_id) {
    const { data: userData } = await service.auth.admin.getUserById(engineer.user_id)
    if (userData?.user) {
      const meta = userData.user.app_metadata ?? {}
      const currentIds: string[] = (meta.property_ids as string[] | undefined) ?? []
      const currentSlugs: string[] = (meta.property_slugs as string[] | undefined) ?? []
      const newIds = currentIds.filter((id) => id !== engineer.property_id)
      const newSlugs = currentSlugs.filter((s) => s !== slug)
      await service.auth.admin.updateUserById(engineer.user_id, {
        app_metadata: {
          ...meta,
          property_ids: newIds,
          property_slugs: newSlugs,
          property_id: newIds[0] ?? null,
          property_slug: newSlugs[0] ?? null,
        },
      })
    }
  }

  // Delete engineer record
  const { error } = await service.from('engineers').delete().eq('id', engineerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
