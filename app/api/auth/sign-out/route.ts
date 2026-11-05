import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Signs out and redirects to a same-origin path (`next`), optionally carrying a `reason` for the login page. */
export async function GET(request: NextRequest) {
  // audit-allow: public by design — only clears the caller's own session cookies
  const supabase = await createClient()
  await supabase.auth.signOut()

  const next = request.nextUrl.searchParams.get('next') ?? '/login'
  const safeNext = next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/login'
  const target = new URL(safeNext, request.nextUrl.origin)
  const reason = request.nextUrl.searchParams.get('reason')
  if (reason) target.searchParams.set('reason', reason)

  return NextResponse.redirect(target)
}
