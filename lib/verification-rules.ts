import { fail, MAX_TEXT_LENGTH, type DecisionResult } from '@/lib/approval-rules'

/**
 * Final verification "send back" (D28): the head engineer returns submitted work to Work Execution with a
 * note instead of sending it to the tenant. Pure rules shared by the route and the tests.
 */

export const SEND_BACK_EVENT_TYPE = 'verification_sent_back'

export function parseSendBack(body: unknown): { reason: string } | { error: string } {
  const input = (body ?? {}) as Record<string, unknown>
  const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, MAX_TEXT_LENGTH) : ''
  if (!reason) return { error: 'Add a note so the engineer knows what to fix.' }
  return { reason }
}

/** Why the work can no longer be sent back, or null when it is waiting for final verification. */
export function sendBackBlocker(wo: { status: string; signed_at: string | null }): DecisionResult | null {
  if (wo.status !== 'svc_submitted') return fail(409, 'This work order is no longer waiting for final verification.')
  if (wo.signed_at) return fail(409, 'The tenant has already signed off this work order.')
  return null
}
