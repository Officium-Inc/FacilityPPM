import NewWorkOrderForm from './NewWorkOrderForm'
import { requirePage } from '@/lib/authz/guard'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function NewWorkOrderPage({ params }: Props) {
  const { slug } = await params
  const { service, property } = await requirePage(slug, 'maintenance.manage')
  const propertyId = property.id

  const [{ data: rawSchedules }, { data: engineers }] = await Promise.all([
    service
      .from('ppm_schedules')
      .select('id, title, assets!inner(id, name, buildings!inner(sites!inner(property_id)))')
      .eq('assets.buildings.sites.property_id', propertyId)
      .eq('is_active', true)
      .order('title'),
    service
      .from('engineers')
      .select('id, full_name')
      .eq('property_id', propertyId)
      .eq('is_active', true)
      .order('full_name'),
  ])

  // Normalize assets relation (Supabase returns array; we expect single or null)
  const schedules = (rawSchedules ?? []).map((s) => ({
    id: s.id as string,
    title: s.title as string,
    assets: Array.isArray(s.assets) ? (s.assets[0] as { id: string; name: string } | undefined) ?? null : (s.assets as { id: string; name: string } | null),
  }))

  return (
    <NewWorkOrderForm
      slug={slug}
      schedules={schedules ?? []}
      engineers={engineers ?? []}
    />
  )
}
