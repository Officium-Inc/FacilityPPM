import { createClient, createServiceClient } from '@/lib/supabase/server'
import EngineersClient from './EngineersClient'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function EngineersPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const propertyId = user?.app_metadata?.property_id as string | undefined

  const service = await createServiceClient()

  const [{ data: engineers }, { data: roles }, { data: pendingInvitations }] = await Promise.all([
    service
      .from('engineers')
      .select('*, roles(id, name)')
      .eq('property_id', propertyId ?? '')
      .order('full_name'),
    service.from('roles').select('id, name').order('name'),
    service
      .from('invitations')
      .select('id, email, invited_name, role_name, invited_by, created_at, expires_at')
      .eq('property_id', propertyId ?? '')
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
  ])

  return (
    <EngineersClient
      slug={slug}
      engineers={engineers ?? []}
      roles={roles ?? []}
      invitations={pendingInvitations ?? []}
    />
  )
}
