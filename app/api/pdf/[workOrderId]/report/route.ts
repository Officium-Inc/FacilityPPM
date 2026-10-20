import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import React, { type ReactElement, type JSXElementConstructor } from 'react'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import WorkOrderFormPdf from '@/components/pdf/WorkOrderFormPdf'
import { fetchFormPhotoBuffers, loadWorkOrderForm } from '@/lib/work-order-form'
import { canViewWorkOrder } from '@/lib/work-order-access'

interface Params {
  params: Promise<{ workOrderId: string }>
}

/**
 * The Work Order Request form. It is reachable without a session (the Monday sync downloads it),
 * so captured signature images are only embedded for signed-in users who may view the work order.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const { workOrderId } = await params
  const service = await createServiceClient()

  const { data: wo } = await service
    .from('work_orders')
    .select('id, wo_number, property_id, requested_by_id, tenant_email')
    .eq('id', workOrderId)
    .single()

  if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const includeSignatures = user ? await canViewWorkOrder(service, user, wo) : false

  const data = await loadWorkOrderForm(service, workOrderId, { includeSignatures })
  if (!data) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

  const photoBuffers = await fetchFormPhotoBuffers(data.photos)
  const element = React.createElement(WorkOrderFormPdf, { data, photoBuffers }) as ReactElement<
    DocumentProps,
    string | JSXElementConstructor<unknown>
  >
  const buffer = await renderToBuffer(element)

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${wo.wo_number}-service-report.pdf"`,
    },
  })
}
