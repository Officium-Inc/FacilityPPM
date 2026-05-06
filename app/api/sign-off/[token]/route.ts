import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateRecordHash } from '@/lib/token'

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
    .select('id, wo_number, status, sign_off_expires_at, signed_at, property_id')
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
    const { signatureData, signedByName, confirmedAt } = body

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
        status: 'verified',
        signed_at: now,
        signed_by_name: signedByName,
        signed_by_ip: ip,
        signed_by_device: device,
        signature_data: signatureData,
        updated_at: now,
      })
      .eq('id', wo.id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

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

    // Trigger PDF generation asynchronously (fire-and-forget)
    fetch(
      `${process.env.NEXT_PUBLIC_APP_URL}/api/pdf/${wo.id}`,
      { method: 'GET', headers: { 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY ?? '' } }
    ).catch(() => {})

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
        status: 'scheduled',
        rejection_reason: rejectionReason.trim(),
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
