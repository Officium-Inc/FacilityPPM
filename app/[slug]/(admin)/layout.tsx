import { requirePage } from '@/lib/authz/guard'
import { userPropertyIds } from '@/lib/authz/actor'
import { recordSupportView } from '@/lib/provider/support'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'
import ProviderSupportBanner from '@/components/layout/ProviderSupportBanner'

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { slug: string }
}) {
  const { slug } = params

  // Providers and active staff only; tenants are redirected to their portal, others signed out.
  const { user, service, property, actor } = await requirePage(slug, 'portal.admin')

  // Keep the active property in sync with the URL so API routes act on the property being viewed.
  if (actor.kind === 'member' && user.app_metadata?.property_slug !== slug) {
    await service.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...user.app_metadata,
        property_id: property.id,
        property_slug: slug,
      },
    })
  }

  // Provider support views are read-only and audit-logged (D2)
  if (actor.kind === 'provider') await recordSupportView(service, user.id, property.id)

  // Properties for the switcher
  const propertyIds = userPropertyIds(user)
  const { data: userProperties } = propertyIds.length > 0
    ? await service.from('properties').select('id, name, slug').in('id', propertyIds)
    : { data: [] }

  const navActor = actor.kind === 'provider' ? { kind: 'provider' as const } : { kind: 'member' as const, role: actor.role }

  return (
    <div className="flex h-dvh overflow-hidden bg-gray-50">
      <Sidebar slug={slug} actor={navActor} propertyName={property.name} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {actor.kind === 'provider' && <ProviderSupportBanner propertyName={property.name} propertySlug={slug} />}
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
