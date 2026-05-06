import { createServiceClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import SuspendedClient from './SuspendedClient'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function SuspendedPage({ params }: Props) {
  const { slug } = await params

  const service = await createServiceClient()
  const { data: property } = await service
    .from('properties')
    .select('name')
    .eq('slug', slug)
    .single()

  // Check if the user is logged in and has access to other properties
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let otherProperties: { id: string; name: string; slug: string }[] = []
  if (user) {
    const propertyIds: string[] = (user.app_metadata?.property_ids as string[] | undefined) ??
      (user.app_metadata?.property_id ? [user.app_metadata.property_id as string] : [])

    if (propertyIds.length > 0) {
      const { data } = await service
        .from('properties')
        .select('id, name, slug')
        .in('id', propertyIds)
        .neq('slug', slug)
        .neq('license_status', 'suspended')

      otherProperties = data ?? []
    }
  }

  return (
    <SuspendedClient
      propertyName={property?.name ?? 'This property'}
      slug={slug}
      isLoggedIn={!!user}
      otherProperties={otherProperties}
    />
  )
}
