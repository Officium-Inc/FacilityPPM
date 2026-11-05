import ProfileClient from '@/components/settings/ProfileClient'
import { getTenantPortalContext } from '@/lib/tenant'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function TenantSettingsPage({ params }: Props) {
  const { slug } = await params
  const context = await getTenantPortalContext(slug)

  const { data: member } = await context.service
    .from('engineers')
    .select('full_name, email, phone')
    .eq('id', context.actor.engineerId)
    .eq('property_id', context.property.id)
    .maybeSingle()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Settings</h2>
        <p className="mt-0.5 text-sm text-gray-500">Your profile and password for the {context.property.name} Tenant Portal.</p>
      </div>
      <ProfileClient
        fullName={member?.full_name ?? context.actor.name}
        email={member?.email ?? context.actor.email ?? context.user.email ?? ''}
        phone={member?.phone ?? ''}
        roleName="Tenant"
      />
    </div>
  )
}