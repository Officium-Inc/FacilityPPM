import { Building2, Layers, Mail, Phone, User, Users } from 'lucide-react'
import { getTenantCompany, getTenantPortalContext } from '@/lib/tenant'
import { roleNameFromRelation } from '@/lib/roles'

interface Props {
  params: Promise<{ slug: string }>
}

/** The tenant's company: its floors in the building and the colleagues who share its requests. */
export default async function TenantCompanyPage({ params }: Props) {
  const { slug } = await params
  const context = await getTenantPortalContext(slug)
  const companyContext = await getTenantCompany(context)
  if (!companyContext) return null
  const { company, floors } = companyContext

  const { data: memberRows } = await context.service
    .from('engineers')
    .select('id, full_name, email, roles(name)')
    .eq('property_id', context.property.id)
    .eq('company_id', company.id)
    .eq('is_active', true)
    .order('full_name')

  const colleagues = (memberRows ?? []).filter((member) => roleNameFromRelation(member.roles) === 'tenant')

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">{company.name}</h2>
        <p className="mt-0.5 text-sm text-gray-500">Your company at {context.property.name}.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <Layers className="h-4 w-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-900">Floors</h3>
          </div>
          {floors.length === 0 ? (
            <p className="text-sm text-gray-500">No floor is assigned to your company yet. Contact the property management office.</p>
          ) : (
            <ul className="space-y-2">
              {floors.map((floor) => (
                <li key={floor.id} className="flex items-center gap-2 text-sm text-gray-800">
                  <Building2 className="h-4 w-4 text-green-700" />
                  {floor.label}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <User className="h-4 w-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-900">Company Contact</h3>
          </div>
          <dl className="space-y-2 text-sm">
            <ContactRow icon={<User className="h-4 w-4" />} value={company.contact_name} />
            <ContactRow icon={<Mail className="h-4 w-4" />} value={company.contact_email} />
            <ContactRow icon={<Phone className="h-4 w-4" />} value={company.contact_phone} />
            {!company.contact_name && !company.contact_email && !company.contact_phone && (
              <p className="text-gray-500">No contact details on file.</p>
            )}
          </dl>
        </section>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
          <Users className="h-4 w-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">Colleagues</h3>
          <span className="text-xs text-gray-400">{colleagues.length}</span>
        </div>
        <p className="border-b border-gray-100 px-5 py-3 text-xs text-gray-500">
          Everyone listed here can see, approve and sign off your company&apos;s service reports.
        </p>
        <ul className="divide-y divide-gray-100">
          {colleagues.map((member) => (
            <li key={member.id} className="flex flex-col gap-0.5 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="font-medium text-gray-900">
                {member.full_name}
                {member.id === context.actor.engineerId && <span className="ml-2 text-xs font-normal text-gray-400">(you)</span>}
              </span>
              <span className="text-gray-500">{member.email}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function ContactRow({ icon, value }: { icon: React.ReactNode; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex items-center gap-2 text-gray-800">
      <span className="text-gray-400">{icon}</span>
      <span className="break-all">{value}</span>
    </div>
  )
}