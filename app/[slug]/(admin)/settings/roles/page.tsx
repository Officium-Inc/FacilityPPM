import { requirePage } from '@/lib/authz/guard'
import { can, toClientActor } from '@/lib/authz/permissions'
import { loadPropertyRoles, roleUsage } from '@/lib/property-roles'
import RolesClient from './RolesClient'

interface Props {
  params: Promise<{ slug: string }>
}

/** Settings → Roles & Permissions (D32, D33). Everyone who sees members sees the roles; `roles.manage` edits them. */
export default async function RolesPage({ params }: Props) {
  const { slug } = await params
  const { service, property, actor } = await requirePage(slug, 'members.view')

  const [roles, usage] = await Promise.all([loadPropertyRoles(service, property.id), roleUsage(service, property.id)])

  return (
    <RolesClient
      slug={slug}
      roles={roles.map((role) => ({
        ...role,
        memberCount: usage.get(role.id)?.members ?? 0,
        invitationCount: usage.get(role.id)?.invitations ?? 0,
      }))}
      actor={toClientActor(actor)}
      canManageRoles={can(actor, 'roles.manage')}
    />
  )
}
