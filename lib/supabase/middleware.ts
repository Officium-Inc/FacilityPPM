import { createServerClient, type CookieMethodsServer } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Slugs that are reserved and must never be treated as property slugs
const RESERVED_SLUGS = new Set(['provider', 'sign-off', 'api', '_next', 'admin', 'static', 'login'])

export async function updateSession(request: NextRequest) {
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

  // ── Root redirect ─────────────────────────────────────────────────
  if (!firstSegment) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/provider/login'
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

  // Login + suspended are public
  if (isLoginPath || isSuspendedPath) {
    // If already authenticated as a user who has access to this slug, redirect to dashboard
    if (isLoginPath && user) {
      const userSlugs: string[] = (user.app_metadata?.property_slugs as string[] | undefined) ??
        (user.app_metadata?.property_slug ? [user.app_metadata.property_slug as string] : [])
      if (userSlugs.includes(slug)) {
        const url = request.nextUrl.clone()
        url.pathname = `/${slug}`
        return NextResponse.redirect(url)
      }
    }
    return supabaseResponse
  }

  // All other [slug]/* routes require auth
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = `/${slug}/login`
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
    // Redirect to their active property or this slug's login
    const activeSlug = user.app_metadata?.property_slug as string | undefined
    const url = request.nextUrl.clone()
    url.pathname = activeSlug ? `/${activeSlug}` : `/${slug}/login`
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
