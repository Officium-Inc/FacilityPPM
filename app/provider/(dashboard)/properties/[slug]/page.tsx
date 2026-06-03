import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import LicenseBadge from '@/components/provider/LicenseBadge'
import PropertyManageClient from './PropertyManageClient'
import type { Property, Engineer, Role } from '@/types'
import { ArrowLeft } from 'lucide-react'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function PropertyManagePage({ params }: Props) {
  const { slug } = await params
  const service = await createServiceClient()

  const { data: property } = await service
    .from('properties')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!property) notFound()
  const prop = property as Property

  // All engineers for this property (with roles)
  const { data: engineers } = await service
    .from('engineers')
    .select('*, roles(id, name)')
    .eq('property_id', prop.id)
    .order('full_name')

  // All available roles
  const { data: roles } = await service.from('roles').select('id, name').order('name')

  // Stats
  const [{ count: woCount }, { count: assetCount }, { count: siteCount }] = await Promise.all([
    service.from('work_orders').select('id', { count: 'exact', head: true }).eq('property_id', prop.id),
    service
      .from('assets')
      .select('id', { count: 'exact', head: true })
      .in(
        'building_id',
        (await service
          .from('buildings')
          .select('id')
          .in(
            'site_id',
            (await service.from('sites').select('id').eq('property_id', prop.id)).data?.map((s) => s.id) ?? []
          )).data?.map((b) => b.id) ?? []
      ),
    service.from('sites').select('id', { count: 'exact', head: true }).eq('property_id', prop.id),
  ])

  // Pending invitations
  const { data: invitations } = await service
    .from('invitations')
    .select('id, email, invited_name, expires_at, used_at, created_at')
    .eq('property_id', prop.id)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <Link
        href="/provider/properties"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Control Panel
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{prop.name}</h2>
          <div className="flex items-center gap-3 mt-1">
            <code className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">/{prop.slug}</code>
            <LicenseBadge status={prop.license_status} />
          </div>
        </div>
        <a
          href={`/${prop.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 hover:underline"
        >
          Open property dashboard →
        </a>
      </div>

      <PropertyManageClient
        property={prop}
        engineers={(engineers as Engineer[]) ?? []}
        roles={(roles as Role[]) ?? []}
        stats={{ workOrders: woCount ?? 0, assets: assetCount ?? 0, sites: siteCount ?? 0 }}
        invitations={(invitations ?? []) as Array<{
          id: string; email: string; invited_name: string | null
          expires_at: string; used_at: string | null; created_at: string
        }>}
      />
    </div>
  )
}

