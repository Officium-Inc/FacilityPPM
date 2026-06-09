import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { propertySlug } = await request.json() as { propertySlug?: string }
  if (!propertySlug) return NextResponse.json({ error: 'propertySlug required' }, { status: 400 })

  const service = await createServiceClient()

  const { data: property } = await service
    .from('properties')
    .select('id')
    .eq('slug', propertySlug)
    .single()

  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  // Providers bypass the active check
  if (user.app_metadata?.role === 'provider') {
    return NextResponse.json({ active: true })
  }

  const { data: engineer } = await service
    .from('engineers')
    .select('is_active')
    .eq('property_id', property.id)
    .eq('user_id', user.id)
    .maybeSingle()

  // No engineer record means they're not restricted (e.g. provider admin)
  if (!engineer) return NextResponse.json({ active: true })

  if (engineer.is_active === false) {
    return NextResponse.json({ error: 'Account deactivated' }, { status: 403 })
  }

  return NextResponse.json({ active: true })
}
