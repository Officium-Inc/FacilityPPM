import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { createServiceClient } from '@/lib/supabase/server'
import { generateRecordHash } from '@/lib/token'
import AcknowledgementReceipt from '@/components/pdf/AcknowledgementReceipt'
import type { WorkOrder } from '@/types'
import React, { type ReactElement, type JSXElementConstructor } from 'react'
import { syncTenant360WorkOrder } from '@/lib/monday/tenant360'

interface Params {
  params: Promise<{ workOrderId: string }>
}

export async function GET(request: NextRequest, { params }: Params) {
  const { workOrderId } = await params
  const supabase = await createServiceClient()

  const { data: wo, error } = await supabase
    .from('work_orders')
    .select(`
      *,
      engineers!work_orders_engineer_id_fkey(id, full_name, email),
      ppm_schedules(
        id, title,
        assets(
          id, name, category, location,
          buildings(id, name, sites(id, name, address, city))
        )
      ),
      checklist_items(*)
    `)
    .eq('id', workOrderId)
    .single()

  if (error || !wo) {
    return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
  }

  const workOrder = wo as WorkOrder

  if (!workOrder.signed_at) {
    return NextResponse.json({ error: 'Work order has not been signed yet' }, { status: 400 })
  }

  const recordHash = generateRecordHash({
    wo_id: workOrder.id,
    signed_by: workOrder.signed_by_name,
    signed_at: workOrder.signed_at,
    ip: workOrder.signed_by_ip,
  })

  // Generate PDF buffer server-side
  const element = React.createElement(
    AcknowledgementReceipt,
    { workOrder, recordHash }
  ) as ReactElement<DocumentProps, string | JSXElementConstructor<unknown>>
  const buffer = await renderToBuffer(element)

  // Upload to Supabase Storage
  const fileName = `receipts/${workOrder.wo_number}-${workOrder.id}.pdf`
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('receipts')
    .upload(fileName, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (!uploadError && uploadData) {
    const { data: { publicUrl } } = supabase.storage
      .from('receipts')
      .getPublicUrl(fileName)

    await supabase
      .from('work_orders')
      .update({ pdf_url: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', workOrderId)

    await syncTenant360WorkOrder(workOrderId)
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${workOrder.wo_number}-receipt.pdf"`,
    },
  })
}
