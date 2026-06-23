import TenantSidebar from '@/components/tenant/TenantSidebar'
import Topbar from '@/components/layout/Topbar'
import { getTenantPortalContext } from '@/lib/tenant'

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { slug: string }
}) {
  const { slug } = params
  const context = await getTenantPortalContext(slug)

  return (
    <div className="flex h-dvh overflow-hidden bg-gray-50">
      <TenantSidebar slug={slug} propertyName={context.property.name} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          title={`${context.property.name} Tenant Portal`}
          slug={slug}
          properties={context.userProperties}
        />
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="min-h-full p-4 sm:p-6">{children}</div>
        </main>
      </div>
    </div>
  )
}
