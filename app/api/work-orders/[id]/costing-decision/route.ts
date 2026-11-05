import { NextRequest, NextResponse } from 'next/server'
import { authorize, requireSession } from '@/lib/authz/guard'
import {
  COSTING_DECISION_COLUMNS,
  decideCosting,
  parseCostingDecision,
  requestMeta,
  type CostingDecisionRecord,
} from '@/lib/approvals'

interface Params {
  params: Promise<{ id: string }>
}

/** A signed-in tenant approves or rejects their company's cost estimate in the Tenant Portal. */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await requireSession()
  if (!session.ok) return session.response
  const { service } = session

  const { data: wo } = await service
    .from('work_orders')
    .select(COSTING_DECISION_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })

  const access = await authorize(session, 'workRequest.approve', { record: wo })
  if (!access.ok) return access.response
  const { actor } = access
  if (actor.kind !== 'member') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  // The decision is recorded under the signed-in member's name
  const decision = parseCostingDecision({ ...body, tenantName: actor.name || body?.tenantName })
  if ('error' in decision) return NextResponse.json({ error: decision.error }, { status: 400 })

  const result = await decideCosting(service, wo as unknown as CostingDecisionRecord, decision, {
    ...requestMeta(request),
    actor,
    enforceLinkExpiry: false,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({ success: true, action: decision.action })
}