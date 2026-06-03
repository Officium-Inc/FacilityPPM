import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

interface Params {
  params: Promise<{ slug: string }>
}

async function requireProvider() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== 'provider') return null
  return user
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { slug } = await params
  if (!await requireProvider()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { license_status, name } = body as { license_status?: string; name?: string }

  const validStatuses = ['active', 'trial', 'suspended']
  if (license_status && !validStatuses.includes(license_status)) {
    return NextResponse.json({ error: 'Invalid license status.' }, { status: 400 })
  }

  const updates: Record<string, string> = {}
  if (license_status) updates.license_status = license_status
  if (name?.trim()) updates.name = name.trim()

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const service = await createServiceClient()
  const { error } = await service.from('properties').update(updates).eq('slug', slug)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { slug } = await params
  if (!await requireProvider()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = await createServiceClient()

  // Fetch property to get id + auth users to clean up
  const { data: property } = await service
    .from('properties')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 })

  // Get all engineers with auth accounts for this property
  const { data: engineers } = await service
    .from('engineers')
    .select('user_id')
    .eq('property_id', property.id)
    .not('user_id', 'is', null)

  // For each user: remove this property from their app_metadata arrays
  if (engineers?.length) {
    await Promise.all(
      engineers.map(async (eng) => {
        if (!eng.user_id) return
        const { data: userData } = await service.auth.admin.getUserById(eng.user_id)
        if (!userData?.user) return
        const meta = userData.user.app_metadata ?? {}
        const currentIds: string[] = (meta.property_ids as string[] | undefined) ?? []
        const currentSlugs: string[] = (meta.property_slugs as string[] | undefined) ?? []
        const newIds = currentIds.filter((id) => id !== property.id)
        const newSlugs = currentSlugs.filter((s) => s !== slug)
        await service.auth.admin.updateUserById(eng.user_id, {
          app_metadata: {
            ...meta,
            property_ids: newIds,
            property_slugs: newSlugs,
            property_id: newIds[0] ?? null,
            property_slug: newSlugs[0] ?? null,
          },
        })
      })
    )
  }

  // Delete property (cascades to all child records via FK)
  const { error } = await service.from('properties').delete().eq('slug', slug)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

