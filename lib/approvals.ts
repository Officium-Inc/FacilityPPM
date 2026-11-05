import type { SupabaseClient } from '@supabase/supabase-js'
import React, { type JSXElementConstructor, type ReactElement } from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import AcknowledgementReceipt from '@/components/pdf/AcknowledgementReceipt'
import {
  SIGN_OFF_STATUSES,
  costingDecisionBlocker,
  fail,
  signOffDecisionBlocker,
  type CostingDecision,
  type CostingDecisionRecord,
  type DecisionContext,
  type DecisionResult,
  type SignOffDecision,
  type SignOffDecisionRecord,
} from '@/lib/approval-rules'
import { generateRecordHash } from '@/lib/token'
import { sendCostingApprovalConfirmationEmail, sendReceiptEmail } from '@/lib/email'
import { logWorkOrderEvent } from '@/lib/work-order-events'
import { syncTenant360WorkOrder } from '@/lib/monday/tenant360'
import { generateAndStoreAuditReport } from '@/lib/audit-report'
import type { WorkOrder } from '@/types'

/**
 * Tenant decisions on a work order: cost estimate approval and work sign-off.
 * Shared by the public token links (`/api/costing-approval/[token]`, `/api/sign-off/[token]`) and the
 * signed-in Tenant Portal routes. Callers must load the record and authorize the caller first; these
 * functions only check that the work order is still waiting for the decision and record it once.
 */

export * from '@/lib/approval-rules'

type Service = SupabaseClient

// ── Cost estimate approval ──────────────────────────────────────────────────

export async function decideCosting(
  service: Service,
  wo: CostingDecisionRecord,
  decision: CostingDecision,
  ctx: DecisionContext
): Promise<DecisionResult> {
  const blocked = costingDecisionBlocker(wo, ctx.enforceLinkExpiry)
  if (blocked) return blocked

  const now = new Date().toISOString()
  const actorEmail = ctx.actor?.email ?? wo.tenant_email
  const via = ctx.actor ? 'portal' : 'link'

  if (decision.action === 'approve') {
    // Conditional update: only one decision can ever be recorded for this estimate
    const { data: updated, error } = await service
      .from('work_orders')
      .update({
        status: 'assigned',
        costing_approved_at: now,
        costing_approved_by_name: decision.approverName,
        costing_approval_signature: decision.signatureData,
        updated_at: now,
      })
      .eq('id', wo.id)
      .eq('status', 'pending_approval')
      .is('costing_approved_at', null)
      .select('id')

    if (error) return fail(500, error.message)
    if (!updated?.length) return fail(409, 'This estimate has already been reviewed.')

    await service.from('approval_trail').insert({
      work_order_id: wo.id,
      stage: 'costing_approval',
      actor_name: decision.approverName,
      actor_role: 'tenant',
      decision: 'approved',
      signature_data: decision.signatureData,
      ip_address: ctx.ip,
    })

    await logWorkOrderEvent(service, wo.id, {
      eventType: 'costing_approved',
      step: 'Cost approval',
      actorName: decision.approverName,
      actorEmail,
      actorRole: 'tenant',
      decision: 'Approved',
      createdAt: now,
      metadata: { via },
    })

    const confirmationEmail = wo.tenant_email ?? ctx.actor?.email ?? null
    if (confirmationEmail) {
      const [{ data: costingRows }, { data: property }] = await Promise.all([
        service
          .from('work_order_costings')
          .select('labour_total, materials_total, subcontractor_total, grand_total, notes')
          .eq('work_order_id', wo.id)
          .limit(1),
        service.from('properties').select('name').eq('id', wo.property_id).maybeSingle(),
      ])
      const costing = costingRows?.[0] as {
        labour_total?: number
        materials_total?: number
        subcontractor_total?: number
        grand_total?: number
        notes?: string | null
      } | undefined
      try {
        await sendCostingApprovalConfirmationEmail({
          toEmail: confirmationEmail,
          toName: wo.tenant_name ?? decision.approverName,
          woNumber: wo.wo_number,
          propertyName: (property as { name?: string } | null)?.name ?? 'your property',
          grandTotal: costing?.grand_total ?? 0,
          labourTotal: costing?.labour_total ?? 0,
          materialsTotal: costing?.materials_total ?? 0,
          subcontractorTotal: costing?.subcontractor_total ?? 0,
          notes: costing?.notes ?? null,
          approvedAt: now,
        })
      } catch {
        // Email is best-effort; the approval is already recorded
      }
    }

    await syncTenant360WorkOrder(wo.id)
    return { ok: true }
  }

  // Rejected: back to costing for revision; the link stops working
  const { data: updated, error } = await service
    .from('work_orders')
    .update({
      status: 'costing',
      rejection_reason: decision.reason,
      costing_token: null,
      costing_token_expires_at: null,
      updated_at: now,
    })
    .eq('id', wo.id)
    .eq('status', 'pending_approval')
    .is('costing_approved_at', null)
    .select('id')

  if (error) return fail(500, error.message)
  if (!updated?.length) return fail(409, 'This estimate has already been reviewed.')

  await service.from('approval_trail').insert({
    work_order_id: wo.id,
    stage: 'costing_approval',
    actor_name: decision.approverName,
    actor_role: 'tenant',
    decision: 'rejected',
    reason: decision.reason,
    ip_address: ctx.ip,
  })

  await logWorkOrderEvent(service, wo.id, {
    eventType: 'costing_rejected',
    step: 'Cost approval',
    actorName: decision.approverName,
    actorEmail,
    actorRole: 'tenant',
    decision: 'Rejected',
    reason: decision.reason,
    createdAt: now,
    metadata: { via },
  })

  return { ok: true }
}

// ── Work sign-off ───────────────────────────────────────────────────────────

export async function decideSignOff(
  service: Service,
  wo: SignOffDecisionRecord,
  decision: SignOffDecision,
  ctx: DecisionContext
): Promise<DecisionResult> {
  const blocked = signOffDecisionBlocker(wo, ctx.enforceLinkExpiry)
  if (blocked) return blocked

  const now = new Date().toISOString()
  const actorEmail = ctx.actor?.email ?? wo.tenant_email
  const via = ctx.actor ? 'portal' : 'link'

  if (decision.action === 'approve') {
    const recordHash = generateRecordHash({
      wo_id: wo.id,
      signed_by: decision.signedByName,
      signed_at: now,
      ip: ctx.ip,
    })

    // Final verification happens before tenant sign-off, so signing completes the order.
    // Orders from the previous flow (signed before verification) stay `signed` until verified.
    const completesNow = Boolean(wo.head_engineer_verified_at)

    const { data: updated, error } = await service
      .from('work_orders')
      .update({
        status: completesNow ? 'completed' : 'signed',
        signed_at: now,
        signed_by_name: decision.signedByName,
        signed_by_ip: ctx.ip,
        signed_by_device: ctx.device,
        signature_data: decision.signatureData,
        rating: decision.rating,
        rating_comment: decision.ratingComment,
        updated_at: now,
      })
      .eq('id', wo.id)
      .is('signed_at', null)
      .in('status', SIGN_OFF_STATUSES)
      .select('id')

    if (error) return fail(500, error.message)
    if (!updated?.length) return fail(409, 'This work order has already been signed off.')

    if (decision.rating) {
      await service.from('service_ratings').insert({
        work_order_id: wo.id,
        rated_engineer_id: wo.engineer_id,
        rating: decision.rating,
        comment: decision.ratingComment,
        submitted_by_name: decision.signedByName,
      })
    }

    await service.from('approval_trail').insert({
      work_order_id: wo.id,
      stage: 'sign_off',
      actor_name: decision.signedByName,
      actor_role: 'tenant',
      decision: 'approved',
      signature_data: decision.signatureData,
      ip_address: ctx.ip,
    })

    await logWorkOrderEvent(service, wo.id, {
      eventType: 'tenant_signed',
      step: 'Tenant sign-off',
      actorName: decision.signedByName,
      actorEmail,
      actorRole: 'tenant',
      decision: 'Approved',
      reason: [
        decision.rating ? `Rated ${decision.rating}/5` : null,
        decision.ratingComment,
      ].filter(Boolean).join(' - ') || null,
      createdAt: now,
      metadata: { via },
    })

    await service.from('audit_log').insert({
      property_id: wo.property_id,
      user_id: ctx.actor?.userId ?? null,
      action: 'work_order.signed',
      entity_type: 'work_order',
      entity_id: wo.id,
      metadata: {
        signed_by: decision.signedByName,
        confirmed_at: decision.confirmedAt,
        record_hash: recordHash,
        via,
      },
      ip_address: ctx.ip,
    })

    await storeAndSendReceipt(service, wo, decision.signedByName, recordHash, ctx)

    // Built last so the timeline and file list include the signed receipt
    if (completesNow) await generateAndStoreAuditReport(service, wo.id)

    await syncTenant360WorkOrder(wo.id)
    return { ok: true }
  }

  const { data: updated, error } = await service
    .from('work_orders')
    .update({
      status: 'in_progress',
      rejection_reason: decision.rejectionReason,
      sign_off_token: null,
      sign_off_expires_at: null,
      head_engineer_verified_at: null,
      updated_at: now,
    })
    .eq('id', wo.id)
    .is('signed_at', null)
    .in('status', SIGN_OFF_STATUSES)
    .select('id')

  if (error) return fail(500, error.message)
  if (!updated?.length) return fail(409, 'This work order has already been signed off.')

  await logWorkOrderEvent(service, wo.id, {
    eventType: 'tenant_rejected',
    step: 'Tenant sign-off',
    actorName: ctx.actor?.name ?? wo.tenant_name ?? 'Tenant',
    actorEmail,
    actorRole: 'tenant',
    decision: 'Rejected',
    reason: decision.rejectionReason,
    createdAt: now,
    metadata: { via },
  })

  // Corrective work order for the rejected work, kept on the same company and floor
  const { data: original } = await service
    .from('work_orders')
    .select('schedule_id, engineer_id, priority')
    .eq('id', wo.id)
    .maybeSingle()

  if (original) {
    const { error: correctiveError } = await service.from('work_orders').insert({
      property_id: wo.property_id,
      company_id: wo.company_id ?? null,
      floor_id: wo.floor_id ?? null,
      schedule_id: original.schedule_id,
      engineer_id: original.engineer_id,
      wo_number: `WO-CORR-${wo.wo_number}`,
      type: 'reactive',
      status: 'scheduled',
      priority: original.priority ?? 'high',
      notes: `Corrective work order raised after tenant rejection of ${wo.wo_number}. Reason: ${decision.rejectionReason}`,
      scheduled_date: now.split('T')[0],
    })
    if (correctiveError) console.error('[sign-off] failed to create corrective work order:', correctiveError.message)
  }

  await service.from('audit_log').insert({
    property_id: wo.property_id,
    user_id: ctx.actor?.userId ?? null,
    action: 'work_order.rejected',
    entity_type: 'work_order',
    entity_id: wo.id,
    metadata: {
      rejection_reason: decision.rejectionReason,
      flagged_items: decision.flaggedItems,
      via,
    },
    ip_address: ctx.ip,
  })

  return { ok: true }
}

/** Renders the acknowledgement receipt, stores it on the work order and emails it to the tenant. Never throws. */
async function storeAndSendReceipt(
  service: Service,
  wo: SignOffDecisionRecord,
  signedByName: string,
  recordHash: string,
  ctx: DecisionContext
) {
  const tenantEmail = wo.tenant_email ?? ctx.actor?.email ?? null
  const tenantName = wo.tenant_name ?? tenantEmail ?? signedByName
  try {
    const { data: fullWo } = await service
      .from('work_orders')
      .select(`*, engineers!work_orders_engineer_id_fkey(id, full_name, email), ppm_schedules(id, title, assets(id, name, category, location, buildings(id, name, sites(id, name, address, city)))), checklist_items(*)`)
      .eq('id', wo.id)
      .single()
    if (!fullWo) return

    const element = React.createElement(AcknowledgementReceipt, { workOrder: fullWo as WorkOrder, recordHash }) as ReactElement<DocumentProps, string | JSXElementConstructor<unknown>>
    const buffer = await renderToBuffer(element)

    const fileName = `receipts/${fullWo.wo_number}-${fullWo.id}.pdf`
    const { data: uploadData, error: uploadError } = await service.storage
      .from('receipts')
      .upload(fileName, buffer, { contentType: 'application/pdf', upsert: true })
    if (!uploadError && uploadData) {
      const { data: { publicUrl } } = service.storage.from('receipts').getPublicUrl(fileName)
      await service.from('work_orders').update({ pdf_url: publicUrl, updated_at: new Date().toISOString() }).eq('id', wo.id)
    }

    if (tenantEmail) {
      const siteName = (fullWo as { ppm_schedules?: { assets?: { buildings?: { sites?: { name?: string } } } } }).ppm_schedules?.assets?.buildings?.sites?.name ?? 'your property'
      await sendReceiptEmail({
        tenantEmail,
        tenantName,
        woNumber: wo.wo_number,
        propertyName: siteName,
        pdfBuffer: Buffer.from(buffer),
      })
    }
  } catch {
    // PDF/email failure is non-fatal
  }
}
