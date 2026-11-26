import { requirePage } from '@/lib/authz/guard'
import { can } from '@/lib/authz/permissions'
import { loadFloorsAndCompanies } from '@/lib/floors'
import FloorsTenantsClient, { type TenantMember } from './FloorsTenantsClient'

interface Props {
  params: Promise<{ slug: string }>
}

function rolePortal(value: unknown) {
  const row = (Array.isArray(value) ? value[0] : value) as { portal?: string } | null | undefined
  return row?.portal ?? null
}

export default async function FloorsTenantsPage({ params }: Props) {
  const { slug } = await params
  const { service, property, actor } = await requirePage(slug, 'floors.view')

  const [{ floors, companies }, { data: members }] = await Promise.all([
    loadFloorsAndCompanies(service, property.id),
    service
      .from('engineers')
      .select('id, full_name, email, is_active, company_id, property_role:property_roles(portal)')
      .eq('property_id', property.id)
      .order('full_name'),
  ])

  const tenantMembers: TenantMember[] = (members ?? [])
    // Members with a Tenant Portal role (any custom tenant role too)
    .filter((member) => rolePortal(member.property_role) === 'tenant')
    .map((member) => ({
      id: member.id as string,
      full_name: member.full_name as string,
      email: member.email as string,
      is_active: member.is_active !== false,
      company_id: (member.company_id as string | null) ?? null,
    }))

  return (
    <FloorsTenantsClient
      slug={slug}
      floors={floors}
      companies={companies}
      tenantMembers={tenantMembers}
      canManageFloors={can(actor, 'floors.manage')}
      canManageCompanies={can(actor, 'companies.manage')}
      canInviteMembers={can(actor, 'members.manage')}
    />
  )
}
