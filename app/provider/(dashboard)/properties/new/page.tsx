import NewPropertyForm from './NewPropertyForm'
import { requireProviderPage } from '@/lib/authz/guard'
import { getTerminatedOrganizationIds } from '@/lib/org/accounts'

interface Props {
  searchParams: Promise<{ org?: string }>
}

/** Platform Admin adds a property to an organization (only Platform Admin creates properties). */
export default async function NewPropertyPage({ searchParams }: Props) {
  const { org } = await searchParams
  const { service } = await requireProviderPage()

  const [{ data }, terminated] = await Promise.all([
    service.from('organizations').select('id, slug, name').order('name'),
    getTerminatedOrganizationIds(service),
  ])
  // Terminated organizations get no new properties until they are reactivated
  const organizations = ((data ?? []) as Array<{ id: string; slug: string; name: string }>).filter((row) => !terminated.has(row.id))
  const initial = organizations.find((row) => row.slug === org)?.id ?? (organizations.length === 1 ? organizations[0].id : '')

  return <NewPropertyForm organizations={organizations} initialOrganizationId={initial} />
}
