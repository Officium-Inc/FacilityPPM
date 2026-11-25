import type { NextRequest } from 'next/server'
import type { ProviderActor, OrgActor } from '@/lib/authz/actor'
import { requestIp } from '@/lib/provider/accounts'
import type { OrgOpsContext } from '@/lib/org/members'

/** The org-operations context for a caller already authorized with `authorizeOrg()` or `requireProvider()`. */
export function orgOpsContext(
  request: NextRequest,
  user: { id: string; email?: string | null },
  actor: OrgActor | ProviderActor
): OrgOpsContext {
  return {
    actor: actor.kind === 'provider'
      ? { kind: 'provider' }
      : { kind: 'org_member', orgRole: actor.orgRole, memberId: actor.memberId, userId: actor.userId },
    userId: user.id,
    email: user.email ?? null,
    ip: requestIp(request),
  }
}
