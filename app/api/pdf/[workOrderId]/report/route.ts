import { NextRequest, NextResponse } from 'next/server'
import { renderWorkOrderFormPdf } from '@/lib/pdf-render'
import { authorize, requireSession } from '@/lib/authz/guard'
import { WORK_ORDER_SCOPE_COLUMNS } from '@/lib/authz/records'

interface Params {
  params: Promise<{ workOrderId: string }>
}

/** The Work Order Request form. The Monday sync renders it in-process (lib/pdf-render.ts), not through this route. */
export async function GET(_req: NextRequest, { params }: Params) {
  const { workOrderId } = await params

  const session = await requireSession()
  if (!session.ok) return session.response
  const { service } = session

  const { data: wo } = await service
    .from('work_orders')
    .select(WORK_ORDER_SCOPE_COLUMNS)
    .eq('id', workOrderId)
    .maybeSingle()

  if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
  const access = await authorize(session, 'workRequest.view', { record: wo })
  if (!access.ok) return access.response

  const pdf = await renderWorkOrderFormPdf(service, workOrderId, { includeSignatures: true })
  if (!pdf) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

  return new NextResponse(new Uint8Array(pdf.buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${pdf.fileName}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
