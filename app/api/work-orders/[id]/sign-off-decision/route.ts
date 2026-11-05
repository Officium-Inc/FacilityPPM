import { NextRequest, NextResponse } from 'next/server'
import { authorize, requireSession } from '@/lib/authz/guard'
import {
  SIGN_OFF_DECISION_COLUMNS,
  decideSignOff,
  parseSignOffDecision,
  requestMeta,
  type SignOffDecisionRecord,
} from '@/lib/approvals'

interface Params {
  params: Promise<{ id: string }>
}

/** A signed-in tenant signs off (or rejects) their company's completed work in the Tenant Portal. */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await requireSession()
  if (!session.ok) return session.response
  const { service } = session

  const { data: wo } = await service
    .from('work_orders')
    .select(SIGN_OFF_DECISION_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })

  const access = await authorize(session, 'workRequest.approve', { record: wo })
  if (!access.ok) return access.response
  const { actor } = access
  if (actor.kind !== 'member') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  // The sign-off is recorded under the signed-in member's name
  const decision = parseSignOffDecision(
    body?.action === 'approve' ? { ...body, signedByName: actor.name || body.signedByName } : body
  )
  if ('error' in decision) return NextResponse.json({ error: decision.error }, { status: 400 })

  const result = await decideSignOff(service, wo as unknown as SignOffDecisionRecord, decision, {
    ...requestMeta(request),
    actor,
    enforceLinkExpiry: false,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({ success: true })
}