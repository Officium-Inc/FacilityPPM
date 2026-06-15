import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateRecordHash } from '@/lib/token'
import { sendReceiptEmail } from '@/lib/email'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import AcknowledgementReceipt from '@/components/pdf/AcknowledgementReceipt'
import type { WorkOrder } from '@/types'
import React, { type ReactElement, type JSXElementConstructor } from 'react'
import { syncTenant360WorkOrder } from '@/lib/monday/tenant360'

interface Params {
  params: Promise<{ token: string }>
}

export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params
  const body = await request.json()
  const { action } = body

  const supabase = await createServiceClient()

  // Fetch work order by token
  const { data: wo, error: fetchErr } = await supabase
    .from('work_orders')
    .select('id, wo_number, status, sign_off_expires_at, signed_at, property_id, tenant_email, tenant_name')
    .eq('sign_off_token', token)
    .single()

  if (fetchErr || !wo) {
    return NextResponse.json({ error: 'Invalid or expired sign-off token.' }, { status: 404 })
  }

  // Validate token expiry
  if (wo.sign_off_expires_at && new Date(wo.sign_off_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This sign-off link has expired.' }, { status: 410 })
  }

  // Validate not already signed
  if (wo.signed_at) {
    return NextResponse.json({ error: 'This work order has already been signed off.' }, { status: 409 })
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    null
  const device = request.headers.get('user-agent') ?? null
  const now = new Date().toISOString()

  if (action === 'approve') {
    const { signatureData, signedByName, confirmedAt, rating, ratingComment } = body

    if (!signatureData || !signedByName) {
      return NextResponse.json({ error: 'Missing signature or name.' }, { status: 400 })
    }

    // Input validation: signature must be a base64 PNG data URL
    if (!signatureData.startsWith('data:image/png;base64,')) {
      return NextResponse.json({ error: 'Invalid signature format.' }, { status: 400 })
    }

    const recordHash = generateRecordHash({
      wo_id: wo.id,
      signed_by: signedByName,
      signed_at: now,
      ip,
    })

    const { error: updateErr } = await supabase
      .from('work_orders')
      .update({
        status: 'signed',
        signed_at: now,
        signed_by_name: signedByName,
        signed_by_ip: ip,
        signed_by_device: device,
        signature_data: signatureData,
        rating: rating ?? null,
        rating_comment: ratingComment?.trim() ?? null,
        updated_at: now,
      })
      .eq('id', wo.id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // Save rating record if provided
    const ratingValue = body.rating as number | undefined
    if (ratingValue && ratingValue >= 1 && ratingValue <= 5) {
      await supabase.from('service_ratings').insert({
        work_order_id: wo.id,
        rated_engineer_id: null, // engineer_id not in scope of this token query
        rating: ratingValue,
        comment: (body.ratingComment as string | undefined)?.trim() ?? null,
        submitted_by_name: signedByName,
      })
    }

    // Add to approval trail
    await supabase.from('approval_trail').insert({
      work_order_id: wo.id,
      stage: 'sign_off',
      actor_name: signedByName,
      actor_role: 'tenant',
      decision: 'approved',
      signature_data: signatureData,
      ip_address: ip,
    })

    // Log audit
    await supabase.from('audit_log').insert({
      property_id: wo.property_id ?? null,
      action: 'work_order.signed',
      entity_type: 'work_order',
      entity_id: wo.id,
      metadata: {
        signed_by: signedByName,
        confirmed_at: confirmedAt,
        record_hash: recordHash,
      },
      ip_address: ip,
    })

    // Generate PDF and email receipt to tenant
    const tenantEmail = (wo as { tenant_email?: string | null }).tenant_email
    const tenantName = (wo as { tenant_name?: string | null }).tenant_name ?? tenantEmail ?? signedByName
    try {
      const { data: fullWo } = await supabase
        .from('work_orders')
        .select(`*, engineers!work_orders_engineer_id_fkey(id, full_name, email), ppm_schedules(id, title, assets(id, name, category, location, buildings(id, name, sites(id, name, address, city)))), checklist_items(*)`)
        .eq('id', wo.id)
        .single()

      if (fullWo) {
        const recordHash = generateRecordHash({
          wo_id: fullWo.id,
          signed_by: signedByName,
          signed_at: now,
          ip,
        })
        const element = React.createElement(AcknowledgementReceipt, { workOrder: fullWo as WorkOrder, recordHash }) as ReactElement<DocumentProps, string | JSXElementConstructor<unknown>>
        const buffer = await renderToBuffer(element)

        // Upload to storage and save pdf_url
        const fileName = `receipts/${fullWo.wo_number}-${fullWo.id}.pdf`
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, buffer, { contentType: 'application/pdf', upsert: true })
        if (!uploadError && uploadData) {
          const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(fileName)
          await supabase.from('work_orders').update({ pdf_url: publicUrl, updated_at: new Date().toISOString() }).eq('id', wo.id)
        }

        // Email receipt to tenant
        if (tenantEmail) {
          const siteName = (fullWo as { ppm_schedules?: { assets?: { buildings?: { sites?: { name?: string } } } } }).ppm_schedules?.assets?.buildings?.sites?.name ?? 'your property'
          await sendReceiptEmail({
            tenantEmail,
            tenantName: tenantName ?? signedByName,
            woNumber: wo.wo_number,
            propertyName: siteName,
            pdfBuffer: Buffer.from(buffer),
          })
        }
      }
    } catch {
      // PDF/email failure is non-fatal
    }

    await syncTenant360WorkOrder(wo.id)

    return NextResponse.json({ success: true })
  }

  if (action === 'reject') {
    const { rejectionReason, flaggedItems } = body

    if (!rejectionReason?.trim()) {
      return NextResponse.json({ error: 'Rejection reason is required.' }, { status: 400 })
    }

    const { error: updateErr } = await supabase
      .from('work_orders')
      .update({
        status: 'in_progress',
        rejection_reason: rejectionReason.trim(),
        sign_off_token: null,
        sign_off_expires_at: null,
        updated_at: now,
      })
      .eq('id', wo.id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // Create corrective work order
    const { data: originalWo } = await supabase
      .from('work_orders')
      .select('schedule_id, engineer_id, priority, ppm_schedules(assets(name))')
      .eq('id', wo.id)
      .single()

    if (originalWo) {
      const correctiveWoNumber = `WO-CORR-${wo.wo_number}`
      await supabase.from('work_orders').insert({
        property_id: wo.property_id ?? null,
        schedule_id: originalWo.schedule_id,
        engineer_id: originalWo.engineer_id,
        wo_number: correctiveWoNumber,
        type: 'reactive',
        status: 'scheduled',
        priority: originalWo.priority ?? 'high',
        notes: `Corrective work order raised after tenant rejection of ${wo.wo_number}. Reason: ${rejectionReason.trim()}`,
        scheduled_date: new Date().toISOString().split('T')[0],
      })
    }

    // Log audit
    await supabase.from('audit_log').insert({
      property_id: wo.property_id ?? null,
      action: 'work_order.rejected',
      entity_type: 'work_order',
      entity_id: wo.id,
      metadata: {
        rejection_reason: rejectionReason.trim(),
        flagged_items: flaggedItems ?? [],
      },
      ip_address: ip,
    })

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid action.' }, { status: 400 })
}
