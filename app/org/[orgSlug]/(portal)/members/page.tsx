import OrgMembersPanel from '@/components/org/OrgMembersPanel'
import { requireOrgPage } from '@/lib/authz/guard'
import { loadOrganizationMembers } from '@/lib/org/overview'

interface Props {
  params: Promise<{ orgSlug: string }>
}

/** Org Admins manage the organization's administrators (owners manage owners). */
export default async function OrgMembersPage({ params }: Props) {
  const { orgSlug } = await params
  const { service, organization, actor } = await requireOrgPage(orgSlug, 'org.members.manage')
  const { members, invitations } = await loadOrganizationMembers(service, organization.id)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Administrators</h2>
        <p className="mt-0.5 text-sm text-gray-500">People who administer every property of {organization.name}.</p>
      </div>
      <OrgMembersPanel
        apiBase={`/api/org/${encodeURIComponent(organization.slug)}`}
        organizationName={organization.name}
        members={members}
        invitations={invitations}
        actor={{ kind: 'org_member', orgRole: actor.orgRole, memberId: actor.memberId, userId: actor.userId }}
      />
    </div>
  )
}
