import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
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

  // Check if the user is an active member of this property and get their role
  // (skip for provider role — they're not in the engineers table)
  let userRole = 'viewer'
  if (user && user.app_metadata?.role === 'provider') {
    userRole = 'admin'
  } else if (user) {
    const { data: engineer } = await service
      .from('engineers')
      .select('is_active, roles(name)')
      .eq('property_id', property.id)
      .eq('user_id', user.id)
      .maybeSingle()

    // If they have an engineer record and it's inactive, sign them out
    if (engineer && engineer.is_active === false) {
      redirect('/api/auth/sign-out?next=/login?reason=deactivated')
    }
    if (engineer) {
      const roleData = (engineer.roles as unknown as { name: string } | null)
      userRole = roleData?.name ?? 'viewer'
    }
  }

  // Auto-switch active property ONLY for active/trial properties, and only
  // when the user's current active slug differs from the one they navigated to.
  if (user && user.app_metadata?.property_slug !== slug) {
    await service.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...user.app_metadata,
        property_id: property.id,
        property_slug: slug,
      },
    })
  }

  // Fetch all properties this user has access to (for the switcher)
  const propertyIds: string[] = (user?.app_metadata?.property_ids as string[] | undefined) ??
    (user?.app_metadata?.property_id ? [user.app_metadata.property_id as string] : [])

  const { data: userProperties } = propertyIds.length > 0
    ? await service.from('properties').select('id, name, slug').in('id', propertyIds)
    : { data: [] }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar slug={slug} userRole={userRole} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar
          title={property.name}
          slug={slug}
          properties={userProperties ?? []}
        />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
