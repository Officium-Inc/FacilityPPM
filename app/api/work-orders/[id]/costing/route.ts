import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendCostingApprovalEmail } from '@/lib/email'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    labourHours = 0,
    labourRate = 0,
    materialsTotal = 0,
    subcontractorTotal = 0,
    lineItems = [],
    notes,
    tenantEmail,
    tenantName,
  } = body as {
    labourHours?: number
    labourRate?: number
    materialsTotal?: number
    subcontractorTotal?: number
    lineItems?: unknown[]
    notes?: string
    tenantEmail?: string
    tenantName?: string
  }

  if (!tenantEmail?.trim()) {
    return NextResponse.json({ error: 'Tenant email is required to send cost approval.' }, { status: 400 })
  }

  const service = await createServiceClient()

  const { data: wo } = await service
    .from('work_orders')
    .select('id, status, wo_number, property_id, properties(name)')
    .eq('id', id)
    .single()

  if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })
  if (wo.status !== 'costing' && wo.status !== 'pending_approval') {
    return NextResponse.json({ error: 'Work order is not in costing stage.' }, { status: 409 })
  }

  const grandTotal = labourHours * labourRate + materialsTotal + subcontractorTotal

  // Resolve engineer
  const { data: engineer } = await service
    .from('engineers')
    .select('id')
    .eq('user_id', user.id)
    .eq('property_id', wo.property_id)
    .maybeSingle()

  const costingPayload = {
    labour_hours: labourHours,
    labour_rate: labourRate,
    materials_total: materialsTotal,
    subcontractor_total: subcontractorTotal,
    line_items: lineItems,
    notes: notes?.trim() ?? null,
    submitted_by_id: engineer?.id ?? null,
    submitted_at: new Date().toISOString(),
  }

  // Try INSERT first; fall back to UPDATE if a record already exists
  const { error: insertErr } = await service
    .from('work_order_costings')
    .insert({ work_order_id: id, ...costingPayload })

  if (insertErr) {
    const { error: updateErr } = await service
      .from('work_order_costings')
      .update(costingPayload)
      .eq('work_order_id', id)
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Generate costing approval token (7 day expiry)
  const costingToken = crypto.randomUUID()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  const { error: updateErr } = await service.from('work_orders').update({
    status: 'pending_approval',
    costing_token: costingToken,
    costing_token_expires_at: expiresAt.toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Send email to tenant
  try {
    const propertyName = (wo as { properties?: { name?: string } }).properties?.name ?? 'your property'
    await sendCostingApprovalEmail({
      toEmail: tenantEmail.trim(),
      toName: tenantName?.trim(),
      woNumber: wo.wo_number,
      propertyName,
      grandTotal,
      token: costingToken,
    })
  } catch {
    // Roll back token — don't leave WO in pending_approval without a valid email sent
    await service.from('work_orders').update({
      status: 'costing',
      costing_token: null,
      costing_token_expires_at: null,
    }).eq('id', id)
    return NextResponse.json({ error: 'Failed to send cost approval email.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, costingToken })
}
