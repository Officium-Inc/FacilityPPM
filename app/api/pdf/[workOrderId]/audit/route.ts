import { NextRequest, NextResponse } from 'next/server'
import { loadAuditReportData, renderAuditReport } from '@/lib/audit-report'
import { authorize, requireSession } from '@/lib/authz/guard'
import { WORK_ORDER_SCOPE_COLUMNS } from '@/lib/authz/records'

interface Params {
  params: Promise<{ workOrderId: string }>
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { workOrderId } = await params

  const session = await requireSession()
  if (!session.ok) return session.response
  const { service } = session

  const { data: wo } = await service
    .from('work_orders')
    .select(`${WORK_ORDER_SCOPE_COLUMNS}, wo_number`)
    .eq('id', workOrderId)
    .maybeSingle()

  if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
  const access = await authorize(session, 'workRequest.view', { record: wo })
  if (!access.ok) return access.response

  const data = await loadAuditReportData(service, workOrderId)
  if (!data) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

  const buffer = await renderAuditReport(data)

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${wo.wo_number}-audit-report.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
