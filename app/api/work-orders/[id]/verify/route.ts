import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { generateRecordHash } from '@/lib/token'
import AcknowledgementReceipt from '@/components/pdf/AcknowledgementReceipt'
import type { WorkOrder } from '@/types'
import React, { type ReactElement, type JSXElementConstructor } from 'react'
import { syncTenant360WorkOrder } from '@/lib/monday/tenant360'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { notes } = body as { notes?: string }

  const service = await createServiceClient()

  const { data: wo } = await service
    .from('work_orders')
    .select('id, status, property_id, engineer_id')
    .eq('id', id)
    .single()

  if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })
  if (wo.status !== 'signed') {
    return NextResponse.json({ error: 'Work order has not been signed off yet.' }, { status: 409 })
  }

  // Resolve head engineer
  const { data: headEngineer } = await service
    .from('engineers')
    .select('id, full_name')
    .eq('user_id', user.id)
    .eq('property_id', wo.property_id)
    .maybeSingle()

  const now = new Date().toISOString()

  const { error } = await service.from('work_orders').update({
    status: 'completed',
    head_engineer_id: headEngineer?.id ?? null,
    head_engineer_verified_at: now,
    head_engineer_notes: notes?.trim() ?? null,
    updated_at: now,
  }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await service.from('approval_trail').insert({
    work_order_id: wo.id,
    stage: 'final_verification',
    actor_name: headEngineer?.full_name ?? 'Head Engineer',
    actor_role: 'head_engineer',
    decision: 'approved',
    reason: notes?.trim() ?? null,
  })

  // Generate and upload PDF inline
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

  await syncTenant360WorkOrder(id)

  return NextResponse.json({ success: true })
}
