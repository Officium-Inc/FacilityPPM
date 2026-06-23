import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

interface Params {
  params: Promise<{ slug: string }>
}

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.app_metadata?.role !== 'provider') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as {
    email?: string
    full_name?: string
    role_id?: string | null
  }

  const normalizedEmail = body.email?.trim().toLowerCase()
  if (!normalizedEmail) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  }

  const service = await createServiceClient()

  const { data: property, error: propErr } = await service
    .from('properties')
    .select('id, slug')
    .eq('slug', slug)
    .single()

  if (propErr || !property) {
    return NextResponse.json({ error: 'Property not found.' }, { status: 404 })
  }

  const roleId = body.role_id?.trim() || null
  if (roleId) {
    const { data: role } = await service
      .from('roles')
      .select('id')
      .eq('id', roleId)
      .maybeSingle()

    if (!role) {
      return NextResponse.json({ error: 'Selected role was not found.' }, { status: 400 })
    }
  }

  const { data: existingEngineer } = await service
    .from('engineers')
    .select('user_id, full_name, email')
    .eq('email', normalizedEmail)
    .not('user_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!existingEngineer?.user_id) {
    return NextResponse.json(
      { error: 'No existing linked account was found for this email. Create the account first or send an invitation.' },
      { status: 404 }
    )
  }

  const { data: alreadyMember } = await service
    .from('engineers')
    .select('id')
    .eq('user_id', existingEngineer.user_id)
    .eq('property_id', property.id)
    .maybeSingle()

  if (alreadyMember) {
    return NextResponse.json(
      { error: 'This user is already assigned to this property.' },
      { status: 409 }
    )
  }

  const { data: authUser, error: authErr } = await service.auth.admin.getUserById(existingEngineer.user_id)
  if (authErr || !authUser.user) {
    return NextResponse.json({ error: authErr?.message ?? 'Linked auth account was not found.' }, { status: 404 })
  }

  const currentMeta = authUser.user.app_metadata ?? {}
  const currentIds: string[] = (currentMeta.property_ids as string[] | undefined) ??
    (currentMeta.property_id ? [currentMeta.property_id as string] : [])
  const currentSlugs: string[] = (currentMeta.property_slugs as string[] | undefined) ??
    (currentMeta.property_slug ? [currentMeta.property_slug as string] : [])

  const { error: metaErr } = await service.auth.admin.updateUserById(existingEngineer.user_id, {
    app_metadata: {
      ...currentMeta,
      property_ids: [...new Set([...currentIds, property.id])],
      property_slugs: [...new Set([...currentSlugs, property.slug])],
    },
  })

  if (metaErr) {
    return NextResponse.json({ error: metaErr.message }, { status: 500 })
  }

  const displayName =
    body.full_name?.trim() ||
    existingEngineer.full_name ||
    (authUser.user.user_metadata?.full_name as string | undefined) ||
    normalizedEmail

  const { data: member, error: engErr } = await service
    .from('engineers')
    .insert({
      property_id: property.id,
      user_id: existingEngineer.user_id,
      role_id: roleId,
      full_name: displayName,
      email: normalizedEmail,
      is_active: true,
    })
    .select('*, roles(id, name)')
    .single()

  if (engErr) {
    return NextResponse.json({ error: engErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, member }, { status: 201 })
}
