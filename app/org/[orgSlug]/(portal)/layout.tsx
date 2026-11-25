import OrgSidebar from '@/components/org/OrgSidebar'
import { requireOrgPage } from '@/lib/authz/guard'
import { formatOrgRole } from '@/lib/org/roles'

/**
 * Org portal (D30): active Org Admins of the organization. Platform Admin is sent to the organization's page
 * in its dashboard; a suspended or expired organization shows its notice.
 */
export default async function OrgPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { orgSlug: string }
}) {
  const { orgSlug } = params
  const { organization, actor, user } = await requireOrgPage(orgSlug)

  return (
    <div className="flex h-dvh overflow-hidden bg-gray-50">
      <OrgSidebar orgSlug={organization.slug} organizationName={organization.name} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white pl-14 pr-3 sm:pr-6 md:pl-6">
          <h1 className="truncate text-sm font-semibold text-gray-900 sm:text-base">{organization.name}</h1>
          <span className="truncate text-sm text-gray-500">
            {user.email} · {formatOrgRole(actor.orgRole)}
          </span>
        </header>
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="min-h-full p-4 sm:p-6">{children}</div>
        </main>
      </div>
    </div>
  )
}
