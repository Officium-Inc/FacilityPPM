import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { slug } = (await request.json()) as { slug?: string }

  if (!slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  }

  // Verify the user actually has access to this slug
  const userSlugs: string[] = (user.app_metadata?.property_slugs as string[] | undefined) ??
    (user.app_metadata?.property_slug ? [user.app_metadata.property_slug as string] : [])

  if (!userSlugs.includes(slug)) {
    return NextResponse.json({ error: 'Access denied to this property' }, { status: 403 })
  }

  // Look up the property to get its id
  const service = await createServiceClient()
  const { data: property, error: propErr } = await service
    .from('properties')
    .select('id, slug')
    .eq('slug', slug)
    .single()

  if (propErr || !property) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  }

  // Update the user's active property in app_metadata (service role bypasses RLS)
  const { error: updateErr } = await service.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...user.app_metadata,
      property_id: property.id,
      property_slug: property.slug,
    },
  })

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, slug: property.slug })
}
