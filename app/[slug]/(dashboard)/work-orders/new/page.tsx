import { createClient, createServiceClient } from '@/lib/supabase/server'
import NewWorkOrderForm from './NewWorkOrderForm'
import { notFound } from 'next/navigation'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function NewWorkOrderPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const propertyId = user?.app_metadata?.property_id as string | undefined

  if (!propertyId) notFound()

  const service = await createServiceClient()

  const [{ data: rawSchedules }, { data: engineers }] = await Promise.all([
    service
      .from('ppm_schedules')
      .select('id, title, assets(id, name)')
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
