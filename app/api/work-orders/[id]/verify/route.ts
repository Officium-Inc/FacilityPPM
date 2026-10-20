import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { generateRecordHash, generateSignOffToken, getSignOffExpiry } from '@/lib/token'
import AcknowledgementReceipt from '@/components/pdf/AcknowledgementReceipt'
import type { WorkOrder } from '@/types'
import React, { type ReactElement, type JSXElementConstructor } from 'react'
import { sendSignOffEmail } from '@/lib/email'
import { generateAndStoreAuditReport } from '@/lib/audit-report'
import { authorizeWorkOrderStaff } from '@/lib/work-order-access'
import { logWorkOrderEvent } from '@/lib/work-order-events'
import { syncTenant360WorkOrder } from '@/lib/monday/tenant360'

interface Params {
  params: Promise<{ id: string }>
}

/**
 * Final verification by the head engineer.
 * svc_submitted -> verified: the tenant sign-off link is generated and emailed.
 * signed (legacy, tenant signed before verification) -> completed.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { notes, tenantEmail, tenantName } = body as { notes?: string; tenantEmail?: string; tenantName?: string }

  const service = await createServiceClient()

  const { data: wo } = await service
    .from('work_orders')
    .select('id, wo_number, status, property_id, engineer_id, tenant_email, tenant_name, properties(name)')
    .eq('id', id)
    .single()

  if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })
  if (wo.status !== 'svc_submitted' && wo.status !== 'signed') {
    return NextResponse.json({ error: 'Work order is not waiting for final verification.' }, { status: 409 })
  }

  const access = await authorizeWorkOrderStaff(service, user, wo.property_id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const { actor } = access

  const isLegacySigned = wo.status === 'signed'
  const now = new Date().toISOString()
  const cleanNotes = notes?.trim() || null

  const resolvedTenantEmail = (wo.tenant_email as string | null)?.trim() || tenantEmail?.trim() || ''
  const resolvedTenantName = (wo.tenant_name as string | null)?.trim() || tenantName?.trim() || resolvedTenantEmail
  if (!isLegacySigned && !resolvedTenantEmail) {
    return NextResponse.json({ error: 'Select the tenant who will sign off this work order.' }, { status: 400 })
  }

  const signOffToken = isLegacySigned ? null : generateSignOffToken()

  const { error } = await service.from('work_orders').update({
    status: isLegacySigned ? 'completed' : 'verified',
    head_engineer_id: actor.id,
    head_engineer_verified_at: now,
    head_engineer_notes: cleanNotes,
    ...(isLegacySigned
      ? {}
      : {
          sign_off_token: signOffToken,
          sign_off_expires_at: getSignOffExpiry().toISOString(),
          tenant_email: resolvedTenantEmail,
          tenant_name: resolvedTenantName,
        }),
    updated_at: now,
  }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await service.from('approval_trail').insert({
    work_order_id: wo.id,
    stage: 'final_verification',
    actor_name: actor.name || 'Head Engineer',
    actor_role: 'head_engineer',
    decision: 'approved',
    reason: cleanNotes,
  })

  await logWorkOrderEvent(service, id, {
    eventType: 'final_verified',
    step: 'Final verification',
    actorName: actor.name,
    actorEmail: actor.email,
    actorRole: actor.role,
    decision: 'Approved',
    reason: cleanNotes,
    createdAt: now,
  })

  if (!isLegacySigned) {
    let emailSent = true
    try {
      const property = wo.properties as { name?: string } | { name?: string }[] | null
      const propertyName = (Array.isArray(property) ? property[0]?.name : property?.name) ?? 'your property'
      await sendSignOffEmail({
        tenantEmail: resolvedTenantEmail,
        tenantName: resolvedTenantName,
        woNumber: wo.wo_number,
        propertyName,
        token: signOffToken!,
      })
    } catch {
      // Non-fatal: the token is saved, so the link can be resent from the work order page
      emailSent = false
    }

    await syncTenant360WorkOrder(id)
    return NextResponse.json({ success: true, emailSent })
  }

  // Legacy path: the tenant already signed, so verification completes the order.
  try {
    const { data: fullWo } = await service
      .from('work_orders')
      .select(`*, engineers!work_orders_engineer_id_fkey(id, full_name, email), ppm_schedules(id, title, assets(id, name, category, location, buildings(id, name, sites(id, name, address, city)))), checklist_items(*)`)
      .eq('id', id)
      .single()

    if (fullWo && fullWo.signed_at) {
      const recordHash = generateRecordHash({
        wo_id: fullWo.id,
        signed_by: fullWo.signed_by_name,
        signed_at: fullWo.signed_at,
        ip: fullWo.signed_by_ip,
      })
      const element = React.createElement(AcknowledgementReceipt, { workOrder: fullWo as WorkOrder, recordHash }) as ReactElement<DocumentProps, string | JSXElementConstructor<unknown>>
      const buffer = await renderToBuffer(element)
      const fileName = `receipts/${fullWo.wo_number}-${fullWo.id}.pdf`
      const { data: uploadData, error: uploadError } = await service.storage
        .from('receipts')
        .upload(fileName, buffer, { contentType: 'application/pdf', upsert: true })
      if (!uploadError && uploadData) {
        const { data: { publicUrl } } = service.storage.from('receipts').getPublicUrl(fileName)
        await service.from('work_orders').update({ pdf_url: publicUrl, updated_at: new Date().toISOString() }).eq('id', id)
      }
    }
  } catch {
    // PDF generation failure is non-fatal
  }

  await generateAndStoreAuditReport(service, id)
  await syncTenant360WorkOrder(id)

  return NextResponse.json({ success: true })
}
