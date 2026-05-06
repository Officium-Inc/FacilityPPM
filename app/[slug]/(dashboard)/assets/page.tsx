import { createClient, createServiceClient } from '@/lib/supabase/server'
import AssetsClient from './AssetsClient'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function AssetsPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const propertyId = user?.app_metadata?.property_id as string | undefined

  const service = await createServiceClient()

  // Fetch all buildings belonging to this property (via site)
  const { data: buildings } = await service
    .from('buildings')
    .select('id, name, sites!inner(id, name, property_id)')
    .eq('sites.property_id', propertyId ?? '')

  // Fetch assets scoped to this property's buildings
  const buildingIds = (buildings ?? []).map((b) => b.id)
  const { data: assets } = buildingIds.length > 0
    ? await service
        .from('assets')
        .select('*, buildings!inner(id, name, sites(id, name))')
        .in('building_id', buildingIds)
        .order('name')
    : { data: [] }

  return (
    <AssetsClient
      slug={slug}
      assets={assets ?? []}
      buildings={(buildings ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        site_name: (b.sites as unknown as { name: string } | null)?.name ?? '',
      }))}
    />
  )
}
