import { Shield } from 'lucide-react'
import OrgProfileForm from '@/components/org/OrgProfileForm'
import LicenseBadge from '@/components/provider/LicenseBadge'
import { requireOrgPage } from '@/lib/authz/guard'
import { canOrg } from '@/lib/org/roles'
import { loadOrganizationAudit } from '@/lib/org/overview'
import { describeAuditEntry } from '@/lib/provider/audit-labels'
import { licenseDateInput, licenseState } from '@/lib/provider/license'
import { formatPHT } from '@/lib/utils'

interface Props {
  params: Promise<{ orgSlug: string }>
}

/** Organization profile, the license (read-only: Platform Admin manages it) and recent activity. */
export default async function OrgSettingsPage({ params }: Props) {
  const { orgSlug } = await params
  const { service, organization, actor } = await requireOrgPage(orgSlug)
  const audit = await loadOrganizationAudit(service, organization.id, 20)
  const expiresOn = licenseDateInput(organization.license_expires_at)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Settings</h2>
        <p className="mt-0.5 text-sm text-gray-500">The organization profile and license.</p>
      </div>

      <OrgProfileForm
        endpoint={`/api/org/${encodeURIComponent(organization.slug)}`}
        organization={organization}
        slug={organization.slug}
        canEdit={canOrg(actor, 'org.profile.edit')}
      />

      <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900">License</h3>
          </div>
          <LicenseBadge status={licenseState(organization)} />
        </div>
        <p className="text-sm text-gray-600">
          {expiresOn ? `Valid until ${expiresOn} (end of day, Philippine time).` : 'No end date.'} The license covers every property of the
          organization and is managed by Platform Admin.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Recent activity</h3>
        {audit.length === 0 ? (
          <p className="text-sm text-gray-400">No activity recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {audit.map((entry) => (
              <li key={entry.id} className="text-sm text-gray-700">
                <span className="mr-2 text-xs text-gray-400">{formatPHT(entry.created_at, true)}</span>
                {describeAuditEntry(entry)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
