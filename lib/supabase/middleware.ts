import { createServerClient, type CookieMethodsServer } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { RESERVED_SLUGS } from '@/lib/reserved-slugs'

/**
 * Routing only, not authorization: pages and routes enforce access with lib/authz. This sends users to the
 * right area and keeps obviously foreign URLs from rendering.
 */

type Meta = Record<string, unknown>

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function propertySlugs(meta: Meta) {
  const slugs = stringList(meta.property_slugs)
  if (slugs.length || Array.isArray(meta.property_slugs)) return slugs
  return typeof meta.property_slug === 'string' ? [meta.property_slug] : []
}

/** Where a signed-in user starts: Platform Admin dashboard, their organization, or a property. */
export function homePath(meta: Meta): string | null {
  if (meta.role === 'provider') return '/provider/organizations'
  const orgSlugs = stringList(meta.org_slugs)
  if (orgSlugs.length) return `/org/${orgSlugs[0]}`
  const slugs = propertySlugs(meta)
  const active = typeof meta.property_slug === 'string' ? meta.property_slug : null
  if (active && slugs.includes(active)) return `/${active}`
  return slugs[0] ? `/${slugs[0]}` : null
}

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
  const meta: Meta = user?.app_metadata ?? {}

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone()
    url.pathname = path
    url.search = ''
    return NextResponse.redirect(url)
  }

  // ── Unified login page ─────────────────────────────────────────
  if (pathname === '/login') {
    // Already authenticated: go to the user's area (users with nowhere to go stay on the login page)
    const home = user ? homePath(meta) : null
    return home ? redirectTo(home) : supabaseResponse
  }

  // ── Platform Admin (provider) routes ─────────────────────────────
  if (firstSegment === 'provider') {
    if (pathname === '/provider/login') return supabaseResponse // public
    if (!user || meta.role !== 'provider') return redirectTo('/provider/login')
    return supabaseResponse
  }

  // ── Public token pages, invitations and password reset ───────────
  if (firstSegment === 'sign-off' || firstSegment === 'costing-approval' || firstSegment === 'invite' || firstSegment === 'reset-password') {
    return supabaseResponse
  }

  // ── Root redirect ─────────────────────────────────────────────────
  if (!firstSegment) {
    if (!user) return redirectTo('/login')
    const home = homePath(meta)
    return home ? redirectTo(home) : supabaseResponse
  }

  // ── Organization portal (/org/[orgSlug]/…) ────────────────────────
  if (firstSegment === 'org') {
    const orgSlug = segments[1]
    if (segments[2] === 'suspended') return supabaseResponse // public notice
    if (!user) return redirectTo('/login')
    if (!orgSlug) return redirectTo(homePath(meta) ?? '/login')
    // Platform Admin is sent to its own organization page by the org layout
    if (meta.role === 'provider') return supabaseResponse
    if (!stringList(meta.org_slugs).includes(orgSlug)) return redirectTo(homePath(meta) ?? '/login')
    return supabaseResponse
  }

  // ── Property slug routes ──────────────────────────────────────────
  const slug = firstSegment

  if (RESERVED_SLUGS.has(slug)) return supabaseResponse // let Next.js 404

  // /[slug]/login → unified /login; /[slug]/suspended is public
  if (pathname === `/${slug}/login`) return redirectTo('/login')
  if (pathname === `/${slug}/suspended`) return supabaseResponse

  // All other [slug]/* routes require auth
  if (!user) return redirectTo('/login')

  // Platform Admin opens the read-only support view (D2); the pages enforce it
  if (meta.role === 'provider') return supabaseResponse

  if (propertySlugs(meta).includes(slug)) return supabaseResponse

  // Org Admins reach their organization's properties (D30): RLS answers only for properties they belong to
  if (stringList(meta.org_ids).length > 0) {
    const { data: property } = await supabase.from('properties').select('id').eq('slug', slug).maybeSingle()
    if (property) return supabaseResponse
  }

  return redirectTo(homePath(meta) ?? '/login')
}
