import OrgPropertiesTable from '@/components/org/OrgPropertiesTable'
import LicenseBadge from '@/components/provider/LicenseBadge'
import { requireOrgPage } from '@/lib/authz/guard'
import { loadOrganizationProperties } from '@/lib/org/overview'
import { licenseDateInput, licenseState } from '@/lib/provider/license'

interface Props {
  params: Promise<{ orgSlug: string }>
}

/** The organization's properties. Org Admins open each one as its Administrator; Platform Admin creates them. */
export default async function OrgPropertiesPage({ params }: Props) {
  const { orgSlug } = await params
  const { service, organization } = await requireOrgPage(orgSlug)
  const properties = await loadOrganizationProperties(service, organization)
  const expiresOn = licenseDateInput(organization.license_expires_at)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Properties</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            You are an Administrator in every property of {organization.name}. To add a property, contact Platform Admin.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          License
          <LicenseBadge status={licenseState(organization)} />
          {expiresOn && <span>until {expiresOn}</span>}
        </div>
      </div>
      <OrgPropertiesTable properties={properties} variant="portal" emptyText="No properties yet. Platform Admin adds them to your organization." />
    </div>
  )
}
