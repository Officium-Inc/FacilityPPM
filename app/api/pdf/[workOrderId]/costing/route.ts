import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { renderCostingPdf } from '@/lib/pdf-render'
import { canViewWorkOrder } from '@/lib/work-order-access'

interface Params {
  params: Promise<{ workOrderId: string }>
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { workOrderId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = await createServiceClient()
  const { data: wo } = await service
    .from('work_orders')
    .select('id, property_id, requested_by_id, tenant_email, engineer_id')
    .eq('id', workOrderId)
    .maybeSingle()

  if (!wo || !(await canViewWorkOrder(service, user, wo))) {
    return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
  }

  const pdf = await renderCostingPdf(service, workOrderId)
  if (!pdf) return NextResponse.json({ error: 'No costing found for this work order' }, { status: 404 })

  return new NextResponse(new Uint8Array(pdf.buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${pdf.fileName}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
