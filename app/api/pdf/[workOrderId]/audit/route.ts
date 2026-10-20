import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { loadAuditReportData, renderAuditReport } from '@/lib/audit-report'
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
    .select('id, wo_number, property_id, requested_by_id, tenant_email')
    .eq('id', workOrderId)
    .single()

  if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

  // Property members can open any report in their property; tenants only their own.
  if (!(await canViewWorkOrder(service, user, wo))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const data = await loadAuditReportData(service, workOrderId)
  if (!data) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

  const buffer = await renderAuditReport(data)

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${wo.wo_number}-audit-report.pdf"`,
    },
  })
}
