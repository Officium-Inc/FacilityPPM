import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { userPropertyIds } from '@/lib/work-order-access'

/** Login check: the user must be an active member of the property they are about to open. */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { propertySlug } = await request.json().catch(() => ({})) as { propertySlug?: string }
  if (!propertySlug) return NextResponse.json({ error: 'propertySlug required' }, { status: 400 })

  // Providers bypass the member check
  if (user.app_metadata?.role === 'provider') {
    return NextResponse.json({ active: true })
  }

  const service = await createServiceClient()

  const { data: property } = await service
    .from('properties')
    .select('id')
    .eq('slug', propertySlug)
    .maybeSingle()

  if (!property || !userPropertyIds(user).includes(property.id)) {
    return NextResponse.json({ error: 'No access to this property', reason: 'no-access' }, { status: 403 })
  }

  const { data: engineer } = await service
    .from('engineers')
    .select('is_active')
    .eq('property_id', property.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!engineer) {
    return NextResponse.json({ error: 'No access to this property', reason: 'no-access' }, { status: 403 })
  }
  if (engineer.is_active === false) {
    return NextResponse.json({ error: 'Account deactivated', reason: 'deactivated' }, { status: 403 })
  }

  return NextResponse.json({ active: true })
}
