import { createClient } from '@/lib/supabase/server'
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

  const signOutPath = slug ? `/${slug}/login` : '/provider/login'

  return (
    <TopbarClient
      title={title}
      userEmail={user?.email ?? ''}
      signOutPath={signOutPath}
      currentSlug={slug}
      properties={properties}
    />
  )
}
