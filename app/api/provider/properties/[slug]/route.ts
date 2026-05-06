import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

interface Params {
  params: Promise<{ slug: string }>
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { slug } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.app_metadata?.role !== 'provider') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { license_status } = body as { license_status?: string }

  const validStatuses = ['active', 'trial', 'suspended']
  if (!license_status || !validStatuses.includes(license_status)) {
    return NextResponse.json({ error: 'Invalid license status.' }, { status: 400 })
  }

  const service = await createServiceClient()
  const { error } = await service
    .from('properties')
    .update({ license_status })
    .eq('slug', slug)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
