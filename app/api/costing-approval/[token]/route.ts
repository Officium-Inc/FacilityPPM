import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateRecordHash } from '@/lib/token'
import { sendCostingApprovalConfirmationEmail } from '@/lib/email'
import { syncTenant360WorkOrder } from '@/lib/monday/tenant360'

interface Params {
  params: Promise<{ token: string }>
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { token } = await params
  const service = await createServiceClient()

  const { data: wo } = await service
    .from('work_orders')
    .select(`
      id, wo_number, status, costing_token_expires_at, costing_approved_at,
      property_id, properties(name),
      work_order_costings(
        labour_hours, labour_rate, labour_total,
        materials_total, subcontractor_total, grand_total, line_items, notes
      )
    `)
    .eq('costing_token', token)
    .single()

  if (!wo) return NextResponse.json({ error: 'Invalid or expired token.' }, { status: 404 })

  if (wo.costing_token_expires_at && new Date(wo.costing_token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This approval link has expired.' }, { status: 410 })
  }

  if (wo.costing_approved_at) {
    return NextResponse.json({ error: 'This estimate has already been reviewed.' }, { status: 409 })
  }

  return NextResponse.json(wo)
}

export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params
  const body = await request.json()
  const { action, tenantName, signatureData, reason } = body as {
    action: 'approve' | 'reject'
    tenantName?: string
    signatureData?: string
    reason?: string
  }

  if (!action || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 })
  }
  if (!tenantName?.trim()) {
    return NextResponse.json({ error: 'Tenant name is required.' }, { status: 400 })
  }
  if (action === 'reject' && !reason?.trim()) {
    return NextResponse.json({ error: 'Rejection reason is required.' }, { status: 400 })
  }
  if (action === 'approve' && signatureData && !signatureData.startsWith('data:image/png;base64,')) {
    return NextResponse.json({ error: 'Invalid signature format.' }, { status: 400 })
  }

  const service = await createServiceClient()

  const { data: wo } = await service
    .from('work_orders')
    .select('id, wo_number, status, costing_token_expires_at, costing_approved_at, property_id, engineer_id, tenant_email, tenant_name')
    .eq('costing_token', token)
    .single()

  if (!wo) return NextResponse.json({ error: 'Invalid or expired token.' }, { status: 404 })

  if (wo.costing_token_expires_at && new Date(wo.costing_token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This approval link has expired.' }, { status: 410 })
  }

  if (wo.costing_approved_at) {
    return NextResponse.json({ error: 'This estimate has already been reviewed.' }, { status: 409 })
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    null
  const now = new Date().toISOString()

  if (action === 'approve') {
    const recordHash = generateRecordHash({
      wo_id: wo.id,
      approved_by: tenantName,
      approved_at: now,
      ip,
    })

    const { error } = await service.from('work_orders').update({
      status: 'assigned',
      costing_approved_at: now,
      costing_approved_by_name: tenantName!.trim(),
      costing_approval_signature: signatureData ?? null,
      updated_at: now,
    }).eq('id', wo.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await service.from('approval_trail').insert({
      work_order_id: wo.id,
      stage: 'costing_approval',
      actor_name: tenantName!.trim(),
      actor_role: 'tenant',
      decision: 'approved',
      signature_data: signatureData ?? null,
      ip_address: ip,
    })

    // Send confirmation email to tenant with cost breakdown
    const tenantEmailAddr = (wo as { tenant_email?: string | null }).tenant_email
    if (tenantEmailAddr) {
      const { data: costingRows } = await service
        .from('work_order_costings')
        .select('labour_total, materials_total, subcontractor_total, grand_total, notes')
        .eq('work_order_id', wo.id)
        .limit(1)
      const costing = costingRows?.[0] as { labour_total?: number; materials_total?: number; subcontractor_total?: number; grand_total?: number; notes?: string | null } | undefined
      const { data: prop } = await service.from('properties').select('name').eq('id', wo.property_id).single()
      try {
        await sendCostingApprovalConfirmationEmail({
          toEmail: tenantEmailAddr,
          toName: (wo as { tenant_name?: string | null }).tenant_name ?? tenantName!.trim(),
          woNumber: wo.wo_number,
          propertyName: (prop as { name?: string } | null)?.name ?? 'your property',
          grandTotal: costing?.grand_total ?? 0,
          labourTotal: costing?.labour_total ?? 0,
          materialsTotal: costing?.materials_total ?? 0,
          subcontractorTotal: costing?.subcontractor_total ?? 0,
          notes: costing?.notes ?? null,
          approvedAt: now,
        })
      } catch { /* non-blocking: don't fail approval if email fails */ }
    }

    void recordHash // used for future PDF hash
    await syncTenant360WorkOrder(wo.id)

  } else {
    // Rejected — return to costing stage for revision
    const { error } = await service.from('work_orders').update({
      status: 'costing',
      rejection_reason: reason!.trim(),
      costing_token: null,
      costing_token_expires_at: null,
      updated_at: now,
    }).eq('id', wo.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await service.from('approval_trail').insert({
      work_order_id: wo.id,
      stage: 'costing_approval',
      actor_name: tenantName!.trim(),
      actor_role: 'tenant',
      decision: 'rejected',
      reason: reason!.trim(),
      ip_address: ip,
    })
  }

  return NextResponse.json({ success: true, action })
}
