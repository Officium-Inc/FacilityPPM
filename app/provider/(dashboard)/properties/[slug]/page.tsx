import { notFound } from 'next/navigation'
import Link from 'next/link'
import LicenseBadge from '@/components/provider/LicenseBadge'
import PropertyManageClient from './PropertyManageClient'
import { requireProviderPage } from '@/lib/authz/guard'
import { getAccountStatus } from '@/lib/provider/account-status'
import { loadPropertyActivity } from '@/lib/provider/activity'
import { licenseDateInput, licenseState } from '@/lib/provider/license'
import type { Property, Engineer, Role } from '@/types'
import { ArrowLeft, Eye } from 'lucide-react'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ invite?: string }>
}

export default async function PropertyManagePage({ params, searchParams }: Props) {
  const { slug } = await params
  const { invite } = await searchParams
  const { service } = await requireProviderPage()

  const { data: property } = await service
    .from('properties')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  if (!property) notFound()
  const prop = property as Property

  const siteIds = (await service.from('sites').select('id').eq('property_id', prop.id)).data?.map((s) => s.id) ?? []
  const buildingIds = siteIds.length
    ? (await service.from('buildings').select('id').in('site_id', siteIds)).data?.map((b) => b.id) ?? []
    : []

  const [
    { data: engineers },
    { data: roles },
    { count: assetCount },
    { data: invitations },
    account,
    activity,
  ] = await Promise.all([
    service.from('engineers').select('*, roles(id, name)').eq('property_id', prop.id).order('full_name'),
    service.from('roles').select('id, name').order('name'),
    buildingIds.length
      ? service.from('assets').select('id', { count: 'exact', head: true }).in('building_id', buildingIds)
      : Promise.resolve({ count: 0 }),
    service
      .from('invitations')
      .select('id, email, invited_name, expires_at, used_at, created_at')
      .eq('property_id', prop.id)
      .order('created_at', { ascending: false }),
    getAccountStatus(service, prop.id),
    loadPropertyActivity(service, prop.id),
  ])

  const state = account.terminated ? 'terminated' : licenseState(prop)
  const expiresOn = licenseDateInput(prop.license_expires_at)

  return (
    <div className="space-y-6">
      <Link
        href="/provider/properties"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Control Panel
      </Link>

      {invite === 'failed' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          The property was created, but the Administrator invitation could not be sent. Invite them again from the Members tab.
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{prop.name}</h2>
          <div className="flex items-center gap-3 mt-1">
            <code className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">/{prop.slug}</code>
            <LicenseBadge status={state} />
            {expiresOn && !account.terminated && <span className="text-xs text-gray-500">until {expiresOn}</span>}
          </div>
        </div>
        <a
          href={`/${prop.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
          title="Opens the property's Admin Portal in read-only support mode"
        >
          <Eye className="w-4 h-4" />
          Open support view (read-only)
        </a>
      </div>

      <PropertyManageClient
        property={prop}
        engineers={(engineers as Engineer[]) ?? []}
        roles={(roles as Role[]) ?? []}
        stats={{ workOrders: activity.summary.total, assets: assetCount ?? 0, sites: siteIds.length }}
        invitations={(invitations ?? []) as Array<{
          id: string; email: string; invited_name: string | null
          expires_at: string; used_at: string | null; created_at: string
        }>}
        account={{ terminated: account.terminated, terminatedAt: account.terminatedAt, reason: account.reason }}
        activity={activity}
      />
    </div>
  )
}