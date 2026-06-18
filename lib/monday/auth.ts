import { createClient, createServiceClient } from '@/lib/supabase/server'
import { normalizeRoleName } from '@/lib/roles'

const MONDAY_MANAGE_ROLES = ['admin', 'property_manager']

export interface MondayPropertyAdminContext {
  user: {
    id: string
    email?: string
    app_metadata?: Record<string, unknown>
  }
  propertyId: string
  service: Awaited<ReturnType<typeof createServiceClient>>
}

export async function requireMondayPropertyAdmin(): Promise<
  | { ok: true; context: MondayPropertyAdminContext }
  | { ok: false; status: number; error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { ok: false, status: 401, error: 'Unauthorized' }

  const propertyId = user.app_metadata?.property_id as string | undefined
  if (!propertyId) return { ok: false, status: 400, error: 'No active property' }

  const service = await createServiceClient()

  if (user.app_metadata?.role === 'provider') {
    return { ok: true, context: { user, propertyId, service } }
  }

  const { data: engineer } = await service
    .from('engineers')
    .select('roles(name)')
    .eq('property_id', propertyId)
    .eq('user_id', user.id)
    .maybeSingle()

  const roleData = engineer?.roles as unknown as { name?: string } | null
  const roleName = normalizeRoleName(roleData?.name)

  if (!MONDAY_MANAGE_ROLES.includes(roleName)) {
    return { ok: false, status: 403, error: 'Forbidden' }
  }

  return { ok: true, context: { user, propertyId, service } }
}
