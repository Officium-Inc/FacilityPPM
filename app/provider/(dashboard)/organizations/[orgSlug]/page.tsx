import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import LicenseBadge from '@/components/provider/LicenseBadge'
import OrganizationManageClient from './OrganizationManageClient'
import { requireProviderPage, type OrganizationRow } from '@/lib/authz/guard'
import { getOrgAccountStatus } from '@/lib/org/accounts'
import { loadOrganizationAudit, loadOrganizationMembers, loadOrganizationProperties } from '@/lib/org/overview'
import { licenseDateInput, licenseState } from '@/lib/provider/license'

interface Props {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ invite?: string }>
}

export default async function OrganizationManagePage({ params, searchParams }: Props) {
  const { orgSlug } = await params
  const { invite } = await searchParams
  const { service } = await requireProviderPage()

  const { data } = await service.from('organizations').select('*').eq('slug', orgSlug).maybeSingle()
  if (!data) notFound()
  const organization = data as OrganizationRow

  const [account, properties, { members, invitations }, audit] = await Promise.all([
    getOrgAccountStatus(service, organization.id),
    loadOrganizationProperties(service, organization),
    loadOrganizationMembers(service, organization.id),
    loadOrganizationAudit(service, organization.id),
  ])

  const state = account.terminated ? 'terminated' : licenseState(organization)
  const expiresOn = licenseDateInput(organization.license_expires_at)

  return (
    <div className="space-y-6">
      <Link href="/provider/organizations" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Organizations
      </Link>

      {invite === 'failed' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          The organization was created, but the Owner invitation could not be sent. Invite them again from the Org Admins tab.
        </div>
      )}

      <div>
        <h2 className="text-2xl font-bold text-gray-900">{organization.name}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <code className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">/org/{organization.slug}</code>
          <LicenseBadge status={state} />
          {expiresOn && !account.terminated && <span className="text-xs text-gray-500">until {expiresOn}</span>}
        </div>
      </div>

      <OrganizationManageClient
        organization={{ ...organization, license_expires_at: organization.license_expires_at ?? null }}
        account={account}
        properties={properties}
        members={members}
        invitations={invitations}
        audit={audit}
      />
    </div>
  )
}
