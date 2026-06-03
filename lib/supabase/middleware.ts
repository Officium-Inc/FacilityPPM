import { createServerClient, type CookieMethodsServer } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Slugs that are reserved and must never be treated as property slugs
const RESERVED_SLUGS = new Set(['provider', 'sign-off', 'api', '_next', 'admin', 'static', 'login', 'invite', 'reset-password'])

export async function updateSession(request: NextRequest) {
  // Guard: if Supabase env vars are not configured, pass through instead of crashing.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error('Missing Supabase environment variables — middleware skipped.')
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const cookieMethods: CookieMethodsServer = {
    getAll() {
      return request.cookies.getAll()
    },
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value }) =>
        request.cookies.set(name, value)
      )
      supabaseResponse = NextResponse.next({ request })
      cookiesToSet.forEach(({ name, value, options }) =>
        supabaseResponse.cookies.set(name, value, options)
      )
    },
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: cookieMethods }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const segments = pathname.split('/').filter(Boolean)
  const firstSegment = segments[0] ?? ''

  // ── Unified login page ─────────────────────────────────────────
  if (pathname === '/login') {
    // Already authenticated — redirect to the appropriate dashboard
    if (user) {
      const url = request.nextUrl.clone()
      if (user.app_metadata?.role === 'provider') {
        url.pathname = '/provider/properties'
      } else {
        const activeSlug = user.app_metadata?.property_slug as string | undefined
        const slugs: string[] = (user.app_metadata?.property_slugs as string[] | undefined) ??
          (activeSlug ? [activeSlug] : [])
        url.pathname = activeSlug ?? slugs[0] ? `/${activeSlug ?? slugs[0]}` : '/login'
      }
      return NextResponse.redirect(url)
    }
    return supabaseResponse // public
  }

  // ── Provider routes ──────────────────────────────────────────────
  if (firstSegment === 'provider') {
    if (pathname === '/provider/login') return supabaseResponse // public

    if (!user || user.app_metadata?.role !== 'provider') {
      const url = request.nextUrl.clone()
      url.pathname = '/provider/login'
      return NextResponse.redirect(url)
    }

    return supabaseResponse
  }

  // ── Sign-off routes (public, token-validated in route handler) ────
  if (firstSegment === 'sign-off') {
    return supabaseResponse
  }

  // ── Invite + reset-password routes (public) ───────────────────────
  if (firstSegment === 'invite' || firstSegment === 'reset-password') {
    return supabaseResponse
  }

  // ── Root redirect ─────────────────────────────────────────────────
  if (!firstSegment) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    if (user.app_metadata?.role === 'provider') {
      const url = request.nextUrl.clone()
      url.pathname = '/provider/properties'
      return NextResponse.redirect(url)
    }
    // Use all slugs; prefer the active one, but fall back to any available
    const activeSlugs: string[] = (user.app_metadata?.property_slugs as string[] | undefined) ??
      (user.app_metadata?.property_slug ? [user.app_metadata.property_slug as string] : [])
    const activeSlug = (user.app_metadata?.property_slug as string | undefined) ?? activeSlugs[0]
    const targetSlug = activeSlug ?? activeSlugs[0]
    if (targetSlug) {
      const url = request.nextUrl.clone()
      url.pathname = `/${targetSlug}`
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // ── Property slug routes ──────────────────────────────────────────
  const slug = firstSegment

  if (RESERVED_SLUGS.has(slug)) return supabaseResponse // let Next.js 404

  const isLoginPath = pathname === `/${slug}/login`
  const isSuspendedPath = pathname === `/${slug}/suspended`

  // /[slug]/login → redirect to unified /login
  if (isLoginPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // /[slug]/suspended is public
  if (isSuspendedPath) {
    return supabaseResponse
  }

  // All other [slug]/* routes require auth
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Verify the user has access to this property slug
  const userSlugs: string[] = (user.app_metadata?.property_slugs as string[] | undefined) ??
    (user.app_metadata?.property_slug ? [user.app_metadata.property_slug as string] : [])

  if (!userSlugs.includes(slug)) {
    if (user.app_metadata?.role === 'provider') {
      const url = request.nextUrl.clone()
      url.pathname = '/provider/properties'
      return NextResponse.redirect(url)
    }
    // Redirect to their active property or unified login
    const activeSlug = user.app_metadata?.property_slug as string | undefined
    const url = request.nextUrl.clone()
    url.pathname = activeSlug ? `/${activeSlug}` : '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
