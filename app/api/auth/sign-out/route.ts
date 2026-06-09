import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  const next = request.nextUrl.searchParams.get('next') ?? '/login'
  const url = request.nextUrl.clone()
  url.pathname = next
  url.search = ''
  return NextResponse.redirect(url)
}
