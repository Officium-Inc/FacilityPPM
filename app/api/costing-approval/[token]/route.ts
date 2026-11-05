import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  COSTING_DECISION_COLUMNS,
  costingDecisionBlocker,
  decideCosting,
  parseCostingDecision,
  requestMeta,
  type CostingDecisionRecord,
} from '@/lib/approvals'

interface Params {
  params: Promise<{ token: string }>
}

/** Public cost approval link: the token is the only credential, so return just what the review page needs. */
export async function GET(_request: NextRequest, { params }: Params) {
  const { token } = await params
  const service = await createServiceClient()

  const { data: wo } = await service
    .from('work_orders')
    .select(`
      ${COSTING_DECISION_COLUMNS},
      properties(name),
      work_order_costings(
        labour_hours, labour_rate, labour_total,
        materials_total, subcontractor_total, grand_total, line_items, notes
      )
    `)
    .eq('costing_token', token)
    .maybeSingle()

  if (!wo) return NextResponse.json({ error: 'Invalid or expired token.' }, { status: 404 })

  const blocked = costingDecisionBlocker(wo as unknown as CostingDecisionRecord, true)
  if (blocked && !blocked.ok) return NextResponse.json({ error: blocked.error }, { status: blocked.status })

  const row = wo as unknown as { wo_number: string; properties: unknown; work_order_costings: unknown }
  return NextResponse.json({
    wo_number: row.wo_number,
    properties: row.properties,
    work_order_costings: row.work_order_costings,
  })
}

export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params
  const decision = parseCostingDecision(await request.json().catch(() => null))
  if ('error' in decision) return NextResponse.json({ error: decision.error }, { status: 400 })

  const service = await createServiceClient()
  const { data: wo } = await service
    .from('work_orders')
    .select(COSTING_DECISION_COLUMNS)
    .eq('costing_token', token)
    .maybeSingle()

  if (!wo) return NextResponse.json({ error: 'Invalid or expired token.' }, { status: 404 })

  const result = await decideCosting(service, wo as unknown as CostingDecisionRecord, decision, {
    ...requestMeta(request),
    enforceLinkExpiry: true,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({ success: true, action: decision.action })
}
