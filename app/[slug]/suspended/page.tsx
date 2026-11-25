import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUser, isLicenseBlocked, PROPERTY_WITH_ORGANIZATION, type PropertyRow } from '@/lib/authz/guard'
import { loadAccessibleProperties } from '@/lib/access'
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
    .maybeSingle()

  // Signed-in users see the other properties they can still open
  const user = await getCurrentUser()
  let otherProperties: { id: string; name: string; slug: string }[] = []
  if (user) {
    const accessible = (await loadAccessibleProperties(service, user.id)).filter((entry) => entry.slug !== slug)
    if (accessible.length > 0) {
      const { data } = await service
        .from('properties')
        .select(PROPERTY_WITH_ORGANIZATION)
        .in('id', accessible.map((entry) => entry.id))
      const usable = new Set(
        ((data ?? []) as unknown as Array<PropertyRow & { organization: unknown }>)
          .map((row) => ({ ...row, organization: Array.isArray(row.organization) ? row.organization[0] ?? null : row.organization }))
          .filter((row) => !isLicenseBlocked(row as PropertyRow))
          .map((row) => row.id)
      )
      otherProperties = accessible.filter((entry) => usable.has(entry.id))
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
