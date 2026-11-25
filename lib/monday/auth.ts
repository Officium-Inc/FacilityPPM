import { authorizeForSlug, requireSession, type Service } from '@/lib/authz/guard'
import type { Actor } from '@/lib/authz/actor'

export interface MondayPropertyAdminContext {
  actor: Actor
  user: { id: string; email: string | null }
  propertyId: string
  service: Service
}

/** Route params of `/api/properties/[slug]/integrations/monday/…`. */
export type MondayRouteParams = Promise<{ slug: string }>

/** Monday.com integration settings: Administrators and Property Managers of the property in the URL. */
export async function requireMondayPropertyAdmin(params: MondayRouteParams): Promise<
  | { ok: true; context: MondayPropertyAdminContext }
  | { ok: false; status: number; error: string }
> {
  const { slug } = await params
  const session = await requireSession()
  if (!session.ok) return { ok: false, status: 401, error: 'Unauthorized' }

  const access = await authorizeForSlug(session, slug, 'property.integrations.manage')
  if (!access.ok) {
    const body = await access.response.json().catch(() => ({ error: 'Forbidden' }))
    return { ok: false, status: access.response.status, error: body.error ?? 'Forbidden' }
  }

  return {
    ok: true,
    context: {
      actor: access.actor,
      user: { id: session.user.id, email: session.user.email ?? null },
      propertyId: access.propertyId,
      service: session.service,
    },
  }
}
