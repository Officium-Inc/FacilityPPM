import { createClient, createServiceClient } from '@/lib/supabase/server'
import TopbarClient from './TopbarClient'

interface PropertyOption {
  id: string
  name: string
  slug: string
}

export default async function Topbar({
  title,
  slug,
  properties = [],
}: {
  title?: string
  slug?: string
  properties?: PropertyOption[]
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch unread notification count for the current engineer
  let unreadCount = 0
  if (user) {
    const propertyId = user.app_metadata?.property_id as string | undefined
    if (propertyId) {
      const service = await createServiceClient()
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
      unreadNotifications={unreadCount}
    />
  )
}
