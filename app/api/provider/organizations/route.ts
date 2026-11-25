import { NextRequest, NextResponse } from 'next/server'
import { requireProvider } from '@/lib/authz/guard'
import { requestIp } from '@/lib/provider/accounts'
import { createOrganization } from '@/lib/org/accounts'
import { inviteOrgMember } from '@/lib/org/members'

/**
 * Creates an organization (D29) with its license and, optionally, the invitation for its first Owner.
 * A failed invitation does not undo the organization; it is reported so it can be resent.
 */
export async function POST(request: NextRequest) {
  const provider = await requireProvider()
  if (!provider.ok) return provider.response
  const { service, user, actor } = provider

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const ownerEmail = typeof body.owner_email === 'string' ? body.owner_email.trim() : ''
  const ctx = { userId: user.id, ip: requestIp(request) }

  const created = await createOrganization(service, body, ctx)
  if (!created.ok) return NextResponse.json({ error: created.error }, { status: created.status })
  const { organization } = created

  let invite: { sent: boolean; error?: string } | null = null
  if (ownerEmail) {
    const result = await inviteOrgMember(
      service,
      organization,
      { email: ownerEmail, name: body.owner_name, org_role: 'owner' },
      { actor, userId: user.id, email: user.email ?? null, ip: ctx.ip }
    )
    invite = result.ok ? { sent: true } : { sent: false, error: result.error }
  }

  return NextResponse.json({ organization, invite }, { status: 201 })
}
