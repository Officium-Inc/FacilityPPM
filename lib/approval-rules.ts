import type { SupabaseClient } from '@supabase/supabase-js'
import type { MemberActor } from '@/lib/authz/actor'
import { WORK_ORDER_SCOPE_COLUMNS } from '@/lib/authz/records'
import type { WorkOrder } from '@/types'

/**
 * Rules for tenant decisions (cost estimate approval and work sign-off): input parsing, "is this work
 * order still waiting for the tenant?" checks and the read-only review page data. Decisions themselves
 * (writes, emails, PDFs) live in `lib/approvals.ts`, which pages should not import.
 */

export type DecisionResult = { ok: true } | { ok: false; status: number; error: string }

export const fail = (status: number, error: string): DecisionResult => ({ ok: false, status, error })

export interface DecisionContext {
  ip: string | null
  device: string | null
  /** The signed-in tenant deciding in the portal; absent for public token links. */
  actor?: MemberActor
  /** Public links expire; a signed-in tenant's decision is not bound to a link. */
  enforceLinkExpiry: boolean
}

export const MAX_NAME_LENGTH = 120
export const MAX_TEXT_LENGTH = 2000
export const MAX_SIGNATURE_LENGTH = 1_000_000
const PNG_DATA_URL = 'data:image/png;base64,'

export function requestMeta(request: Request) {
  return {
    ip: request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? request.headers.get('x-real-ip') ?? null,
    device: request.headers.get('user-agent') ?? null,
  }
}

function text(value: unknown, max = MAX_TEXT_LENGTH) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function signature(value: unknown) {
  return typeof value === 'string' && value ? value : null
}

function isValidSignature(value: string) {
  return value.startsWith(PNG_DATA_URL) && value.length <= MAX_SIGNATURE_LENGTH
}

// ── Cost estimate approval ──────────────────────────────────────────────────

export const COSTING_DECISION_COLUMNS =
  `${WORK_ORDER_SCOPE_COLUMNS}, wo_number, status, costing_token_expires_at, costing_approved_at, tenant_name`

export interface CostingDecisionRecord {
  id: string
  wo_number: string
  status: string
  property_id: string | null
  costing_token_expires_at: string | null
  costing_approved_at: string | null
  tenant_email: string | null
  tenant_name: string | null
}

export interface CostingDecision {
  action: 'approve' | 'reject'
  approverName: string
  signatureData: string | null
  reason: string | null
}

export function parseCostingDecision(body: unknown): CostingDecision | { error: string } {
  const input = (body ?? {}) as Record<string, unknown>
  const action = input.action
  if (action !== 'approve' && action !== 'reject') return { error: 'Invalid action.' }

  const approverName = text(input.tenantName, MAX_NAME_LENGTH)
  if (!approverName) return { error: 'Tenant name is required.' }

  const reason = text(input.reason)
  if (action === 'reject' && !reason) return { error: 'Rejection reason is required.' }

  const signatureData = action === 'approve' ? signature(input.signatureData) : null
  if (signatureData && !isValidSignature(signatureData)) return { error: 'Invalid signature format.' }

  return { action, approverName, signatureData, reason: reason || null }
}

/** Why the estimate can no longer be decided, or null when it is waiting for the tenant. */
export function costingDecisionBlocker(wo: CostingDecisionRecord, enforceLinkExpiry: boolean): DecisionResult | null {
  if (wo.status === 'cancelled') return fail(410, 'This service report was cancelled.')
  if (enforceLinkExpiry && wo.costing_token_expires_at && new Date(wo.costing_token_expires_at) < new Date()) {
    return fail(410, 'This approval link has expired.')
  }
  if (wo.costing_approved_at) return fail(409, 'This estimate has already been reviewed.')
  // A waived or re-costed order has no pending estimate, even if an older link still exists
  if (wo.status !== 'pending_approval') return fail(409, 'This estimate is no longer waiting for approval.')
  return null
}

// ── Work sign-off ───────────────────────────────────────────────────────────

/** `verified` = waiting for the tenant; legacy `svc_submitted` orders that already had a link also qualify. */
export const SIGN_OFF_STATUSES = ['verified', 'svc_submitted']

export const SIGN_OFF_DECISION_COLUMNS =
  `${WORK_ORDER_SCOPE_COLUMNS}, wo_number, status, sign_off_token, sign_off_expires_at, signed_at, floor_id, tenant_name, head_engineer_verified_at`

export interface SignOffDecisionRecord {
  id: string
  wo_number: string
  status: string
  property_id: string | null
  engineer_id: string | null
  company_id?: string | null
  floor_id?: string | null
  sign_off_token: string | null
  sign_off_expires_at: string | null
  signed_at: string | null
  tenant_email: string | null
  tenant_name: string | null
  head_engineer_verified_at: string | null
}

export type SignOffDecision =
  | {
      action: 'approve'
      signedByName: string
      signatureData: string
      confirmedAt: string | null
      rating: number | null
      ratingComment: string | null
    }
  | {
      action: 'reject'
      rejectionReason: string
      flaggedItems: string[]
    }

export function parseSignOffDecision(body: unknown): SignOffDecision | { error: string } {
  const input = (body ?? {}) as Record<string, unknown>

  if (input.action === 'approve') {
    const signedByName = text(input.signedByName, MAX_NAME_LENGTH)
    const signatureData = signature(input.signatureData)
    if (!signatureData || !signedByName) return { error: 'Missing signature or name.' }
    if (!isValidSignature(signatureData)) return { error: 'Invalid signature format.' }
    const rating = typeof input.rating === 'number' && Number.isInteger(input.rating) && input.rating >= 1 && input.rating <= 5
      ? input.rating
      : null
    return {
      action: 'approve',
      signedByName,
      signatureData,
      confirmedAt: text(input.confirmedAt, 40) || null,
      rating,
      ratingComment: text(input.ratingComment) || null,
    }
  }

  if (input.action === 'reject') {
    const rejectionReason = text(input.rejectionReason)
    if (!rejectionReason) return { error: 'Rejection reason is required.' }
    const flaggedItems = Array.isArray(input.flaggedItems)
      ? input.flaggedItems.filter((item): item is string => typeof item === 'string').slice(0, 200)
      : []
    return { action: 'reject', rejectionReason, flaggedItems }
  }

  return { error: 'Invalid action.' }
}

export function isAwaitingSignOff(wo: { status: string; sign_off_token?: string | null }) {
  return wo.status === 'verified' || (wo.status === 'svc_submitted' && Boolean(wo.sign_off_token))
}

/** Why the work can no longer be signed off, or null when it is waiting for the tenant. */
export function signOffDecisionBlocker(wo: SignOffDecisionRecord, enforceLinkExpiry: boolean): DecisionResult | null {
  if (wo.status === 'cancelled') return fail(410, 'This service report was cancelled.')
  if (enforceLinkExpiry && wo.sign_off_expires_at && new Date(wo.sign_off_expires_at) < new Date()) {
    return fail(410, 'This sign-off link has expired.')
  }
  if (wo.signed_at) return fail(409, 'This work order has already been signed off.')
  if (!isAwaitingSignOff(wo)) return fail(409, 'This work order is not waiting for sign-off.')
  return null
}

// ── Sign-off review page data (read-only) ───────────────────────────────────

export const SIGN_OFF_VIEW_SELECT = `
  *,
  engineers!work_orders_engineer_id_fkey(id, full_name),
  ppm_schedules(
    id, title,
    assets(
      id, name, category, location,
      buildings(id, name, sites(id, name, address, city))
    )
  ),
  checklist_items(*)
`

/** Description, photos and documents from every stage of the work order, for the sign-off review. */
export async function loadSignOffEvidence(service: SupabaseClient, workOrder: WorkOrder) {
  const [{ data: evidenceRows }, { data: reportRows }] = await Promise.all([
    service
      .from('work_order_completion_evidence')
      .select('work_description, completion_photo_urls, supporting_doc_urls')
      .eq('work_order_id', workOrder.id)
      .limit(1),
    service
      .from('work_order_reports')
      .select('fault_description, scope_of_work, photo_urls, inspection_photo_urls')
      .eq('work_order_id', workOrder.id)
      .limit(1),
  ])

  const evidence = (evidenceRows ?? [])[0] as { work_description?: string; completion_photo_urls?: string[]; supporting_doc_urls?: string[] } | undefined
  const report = (reportRows ?? [])[0] as { fault_description?: string; scope_of_work?: string; photo_urls?: string[]; inspection_photo_urls?: string[] } | undefined
  const checklist = (workOrder.checklist_items ?? []) as Array<{ photo_urls?: string[] }>

  return {
    workDescription: evidence?.work_description || report?.scope_of_work || report?.fault_description || null,
    allPhotos: [
      ...(report?.photo_urls ?? []),
      ...(report?.inspection_photo_urls ?? []),
      ...(evidence?.completion_photo_urls ?? []),
      ...checklist.flatMap((item) => item.photo_urls ?? []),
    ].filter(Boolean),
    allDocs: (evidence?.supporting_doc_urls ?? []).filter(Boolean),
  }
}
