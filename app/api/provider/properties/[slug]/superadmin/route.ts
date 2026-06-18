import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { resolveCanonicalRoleId } from '@/lib/roles'

interface Params {
  params: Promise<{ slug: string }>
}

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params

  // Verify provider auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.app_metadata?.role !== 'provider') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { full_name, email, password } = body as {
    full_name?: string
    email?: string
    password?: string
  }

  if (!full_name?.trim() || !email?.trim() || !password) {
    return NextResponse.json({ error: 'Name, email, and password are required.' }, { status: 400 })
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  const service = await createServiceClient()

  // Look up the property
  const { data: property, error: propErr } = await service
    .from('properties')
    .select('id, slug, name')
    .eq('slug', slug)
    .single()

  if (propErr || !property) {
    return NextResponse.json({ error: 'Property not found.' }, { status: 404 })
  }

  const roleId = await resolveCanonicalRoleId(service, 'admin')

  // Try creating a new auth user first
  const { data: authData, error: authErr } = await service.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
    app_metadata: {
      role: 'superadmin',
      property_id: property.id,
      property_slug: property.slug,
      property_ids: [property.id],
      property_slugs: [property.slug],
    },
    user_metadata: {
      full_name: full_name.trim(),
    },
  })

  if (authErr) {
    // User already exists — add them to this property instead
    if (authErr.message?.includes('already registered')) {
      return addExistingUserToProperty({ service, roleId, property, full_name, email })
    }
    return NextResponse.json({ error: authErr.message }, { status: 500 })
  }

  // Insert engineer record for the new auth user
  const { error: engErr } = await service.from('engineers').insert({
    property_id: property.id,
    user_id: authData.user.id,
    role_id: roleId,
    full_name: full_name.trim(),
    email: email.trim().toLowerCase(),
    is_active: true,
  })

  if (engErr) {
    // Auth user was created — clean up to avoid orphan
    await service.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: engErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, user_id: authData.user.id }, { status: 201 })
}

async function addExistingUserToProperty({
  service,
  roleId,
  property,
  full_name,
  email,
}: {
  service: Awaited<ReturnType<typeof createServiceClient>>
  roleId: string | null
  property: { id: string; slug: string; name: string }
  full_name: string
  email: string
}) {
  const normalizedEmail = email.trim().toLowerCase()

  // Find the existing engineer record to get their user_id
  const { data: existingEngineer } = await service
    .from('engineers')
    .select('user_id')
    .eq('email', normalizedEmail)
    .not('user_id', 'is', null)
    .limit(1)
    .single()

  if (!existingEngineer?.user_id) {
    return NextResponse.json(
      { error: 'A user with this email already exists but has no linked auth account.' },
      { status: 409 }
    )
  }

  // Check if already a member of this property
  const { data: alreadyMember } = await service
    .from('engineers')
    .select('id')
    .eq('user_id', existingEngineer.user_id)
    .eq('property_id', property.id)
    .single()

  if (alreadyMember) {
    return NextResponse.json(
      { error: 'This user is already assigned to this property.' },
      { status: 409 }
    )
  }

  // Get their current app_metadata to merge property lists
  const { data: authUser } = await service.auth.admin.getUserById(existingEngineer.user_id)
  const currentMeta = authUser?.user?.app_metadata ?? {}
  const currentIds: string[] = (currentMeta.property_ids as string[] | undefined) ??
    (currentMeta.property_id ? [currentMeta.property_id as string] : [])
  const currentSlugs: string[] = (currentMeta.property_slugs as string[] | undefined) ??
    (currentMeta.property_slug ? [currentMeta.property_slug as string] : [])

  // Update app_metadata to include the new property
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

  // Insert engineer record for the new property
  const { error: engErr } = await service.from('engineers').insert({
    property_id: property.id,
    user_id: existingEngineer.user_id,
    role_id: roleId,
    full_name: full_name.trim(),
    email: normalizedEmail,
    is_active: true,
  })

  if (engErr) {
    return NextResponse.json({ error: engErr.message }, { status: 500 })
  }

  return NextResponse.json(
    { success: true, user_id: existingEngineer.user_id, added_to_existing: true },
    { status: 200 }
  )
}
