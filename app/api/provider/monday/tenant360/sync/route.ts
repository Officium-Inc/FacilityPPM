import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function requireProvider() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.app_metadata?.role === 'provider'
}

export async function POST() {
  if (!await requireProvider()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json(
    { error: 'Monday sync moved to each property Settings API Keys tab.' },
    { status: 410 }
  )
}
