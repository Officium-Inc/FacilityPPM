import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { normalizeRoleName } from '@/lib/roles'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { slug: string }
}) {
  const { slug } = params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Use service client to fetch property — middleware already verified the user
  // has this slug in their property_slugs, so bypassing RLS here is safe.
  const service = await createServiceClient()
  const { data: property } = await service
    .from('properties')
    .select('id, name, license_status')
    .eq('slug', slug)
    .single()

  if (!property || property.license_status === 'suspended') {
    redirect(`/${slug}/suspended`)
  }

  // Only active members of this property (or providers) may open the admin portal.
  let userRole = ''
  if (user.app_metadata?.role === 'provider') {
    userRole = 'admin'
  } else {
    const { data: engineer } = await service
      .from('engineers')
      .select('is_active, roles(name)')
      .eq('property_id', property.id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!engineer) {
      redirect('/api/auth/sign-out?next=/login&reason=no-access')
    }
    if (engineer.is_active === false) {
      redirect('/api/auth/sign-out?next=/login&reason=deactivated')
    }
    const roleData = (engineer.roles as unknown as { name: string } | null)
    userRole = normalizeRoleName(roleData?.name)
    if (!userRole) {
      redirect('/api/auth/sign-out?next=/login&reason=no-access')
    }
  }

  // Auto-switch active property ONLY for active/trial properties, and only
  // when the user's current active slug differs from the one they navigated to.
  if (user.app_metadata?.property_slug !== slug) {
    await service.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...user.app_metadata,
        property_id: property.id,
        property_slug: slug,
      },
    })
  }

  if (userRole === 'tenant') {
    redirect(`/${slug}/tenant`)
  }

  // Fetch all properties this user has access to (for the switcher)
  const propertyIds: string[] = (user?.app_metadata?.property_ids as string[] | undefined) ??
    (user?.app_metadata?.property_id ? [user.app_metadata.property_id as string] : [])

  const { data: userProperties } = propertyIds.length > 0
    ? await service.from('properties').select('id, name, slug').in('id', propertyIds)
    : { data: [] }

  return (
    <div className="flex h-dvh overflow-hidden bg-gray-50">
      <Sidebar slug={slug} userRole={userRole} propertyName={property.name} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          title={property.name}
          slug={slug}
          properties={userProperties ?? []}
        />
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="min-h-full p-4 sm:p-6">{children}</div>
        </main>
      </div>
    </div>
  )
}
