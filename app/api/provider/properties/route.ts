import { NextRequest, NextResponse } from 'next/server'
import { requireProvider } from '@/lib/authz/guard'

const RESERVED_SLUGS = new Set([
  'provider', 'sign-off', 'api', '_next', 'admin', 'static', 'login',
  'favicon', 'robots', 'sitemap', 'suspended',
])

export async function POST(request: NextRequest) {
  const provider = await requireProvider()
  if (!provider.ok) return provider.response

  const body = await request.json()
  const { name, slug, license_status } = body as {
    name?: string
    slug?: string
    license_status?: string
  }

  if (!name?.trim() || !slug?.trim()) {
    return NextResponse.json({ error: 'Name and slug are required.' }, { status: 400 })
  }

  const cleanSlug = slug.trim().toLowerCase()

  if (!/^[a-z0-9-]+$/.test(cleanSlug)) {
    return NextResponse.json(
      { error: 'Slug may only contain lowercase letters, numbers, and hyphens.' },
      { status: 400 }
    )
  }

  if (RESERVED_SLUGS.has(cleanSlug)) {
    return NextResponse.json({ error: `"${cleanSlug}" is a reserved slug.` }, { status: 400 })
  }

  const validStatuses = ['active', 'trial', 'suspended']
  const status = validStatuses.includes(license_status ?? '') ? license_status : 'trial'

  const service = provider.service
  const { data, error } = await service
    .from('properties')
    .insert({ name: name.trim(), slug: cleanSlug, license_status: status })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A property with this slug already exists.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ property: data }, { status: 201 })
}
