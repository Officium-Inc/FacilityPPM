import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { hashToken, isPlausibleToken } from '@/lib/token'
import {
  SIGN_OFF_DECISION_COLUMNS,
  decideSignOff,
  parseSignOffDecision,
  requestMeta,
  type SignOffDecisionRecord,
} from '@/lib/approvals'

interface Params {
  params: Promise<{ token: string }>
}

/** Public sign-off link: approve (signature + optional rating) or reject the completed work. */
export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params
  if (!isPlausibleToken(token)) return NextResponse.json({ error: 'Invalid or expired sign-off token.' }, { status: 404 })
  const decision = parseSignOffDecision(await request.json().catch(() => null))
  if ('error' in decision) return NextResponse.json({ error: decision.error }, { status: 400 })

  const service = await createServiceClient()
  const { data: wo } = await service
    .from('work_orders')
    .select(SIGN_OFF_DECISION_COLUMNS)
    .eq('sign_off_token_hash', hashToken(token))
    .maybeSingle()

  if (!wo) return NextResponse.json({ error: 'Invalid or expired sign-off token.' }, { status: 404 })

  const result = await decideSignOff(service, wo as unknown as SignOffDecisionRecord, decision, {
    ...requestMeta(request),
    enforceLinkExpiry: true,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({ success: true })
}
