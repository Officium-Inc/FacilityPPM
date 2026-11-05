import { authorize, requireSession, type Service } from '@/lib/authz/guard'
import type { Actor } from '@/lib/authz/actor'

export interface MondayPropertyAdminContext {
  actor: Actor
  user: { id: string; email: string | null }
  propertyId: string
  service: Service
}

/** Monday.com integration settings: Administrators and Property Managers of the active property. */
export async function requireMondayPropertyAdmin(): Promise<
  | { ok: true; context: MondayPropertyAdminContext }
  | { ok: false; status: number; error: string }
> {
  const session = await requireSession()
  if (!session.ok) return { ok: false, status: 401, error: 'Unauthorized' }

  const propertyId = session.user.app_metadata?.property_id as string | undefined
  if (!propertyId) return { ok: false, status: 400, error: 'No active property' }

  const access = await authorize(session, 'property.integrations.manage', { propertyId })
  if (!access.ok) {
    const body = await access.response.json().catch(() => ({ error: 'Forbidden' }))
    return { ok: false, status: access.response.status, error: body.error ?? 'Forbidden' }
  }

  return {
    ok: true,
    context: {
      actor: access.actor,
      user: { id: session.user.id, email: session.user.email ?? null },
      propertyId,
      service: session.service,
    },
  }
}
