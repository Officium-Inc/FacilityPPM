import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/authz/guard'
import { isProviderUser } from '@/lib/authz/actor'
import { loadAccessibleOrganizations, loadAccessibleProperties, type AccessibleProperty } from '@/lib/access'
import TopbarClient from './TopbarClient'

/**
 * Top bar of the Admin and Tenant portals: the property switcher (from the user's member rows), links to the
 * organizations they administer, and the unread notifications of their member row in `propertyId`.
 */
export default async function Topbar({
  title,
  slug,
  propertyId,
}: {
  title?: string
  slug?: string
  propertyId?: string
}) {
  const user = await getCurrentUser()

  let unreadCount = 0
  let properties: AccessibleProperty[] = []
  let organizations: AccessibleProperty[] = []

  if (user && !isProviderUser(user)) {
    const service = await createServiceClient()
    ;[properties, organizations] = await Promise.all([
      loadAccessibleProperties(service, user.id),
      loadAccessibleOrganizations(service, user.id),
    ])

    if (propertyId) {
      const { data: engineer } = await service
        .from('engineers')
        .select('id')
        .eq('user_id', user.id)
        .eq('property_id', propertyId)
        .maybeSingle()

      if (engineer) {
        const { count } = await service
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('engineer_id', engineer.id)
          .eq('read', false)
        unreadCount = count ?? 0
      }
    }
  }

  const signOutPath = slug ? `/${slug}/login` : '/provider/login'

  return (
    <TopbarClient
      title={title}
      userEmail={user?.email ?? ''}
      signOutPath={signOutPath}
      currentSlug={slug}
      properties={properties}
      organizations={organizations}
      unreadNotifications={unreadCount}
    />
  )
}
