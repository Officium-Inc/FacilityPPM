import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { createServiceClient } from '@/lib/supabase/server'
import ServiceReportPdf from '@/components/pdf/ServiceReportPdf'
import React, { type ReactElement, type JSXElementConstructor } from 'react'

interface Params {
  params: Promise<{ workOrderId: string }>
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { workOrderId } = await params
  const service = await createServiceClient()

  const { data: wo, error } = await service
    .from('work_orders')
    .select(`
      id, wo_number, created_at, property_id,
      ppm_schedules(
        assets(
          name,
          buildings(name, sites(name, address, city))
        )
      ),
      work_order_reports!work_order_reports_work_order_id_fkey(
        fault_description, location_notes, reported_by_name, reported_by_contact,
        urgency, inspection_notes, root_cause, scope_of_work, inspected_at
      ),
      properties(name)
    `)
    .eq('id', workOrderId)
    .single()

  if (error || !wo) {
    return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
  }

  const reports = wo.work_order_reports as {
    fault_description?: string | null
    location_notes?: string | null
    reported_by_name?: string | null
    reported_by_contact?: string | null
    urgency?: string | null
    inspection_notes?: string | null
    root_cause?: string | null
    scope_of_work?: string | null
    inspected_at?: string | null
  }[] | null

  if (!reports || reports.length === 0) {
    return NextResponse.json({ error: 'No report found for this work order' }, { status: 404 })
  }

  const report = reports[0]
  const schedule = wo.ppm_schedules as unknown as { assets: { name: string; buildings: { name: string; sites: { name: string; address: string; city: string } } } | { name: string; buildings: { name: string; sites: { name: string; address: string; city: string } } }[] | null } | null
  const assetRaw = schedule?.assets
  const asset = Array.isArray(assetRaw) ? assetRaw[0] ?? null : assetRaw
  const building = asset?.buildings ?? null
  const siteRaw = building?.sites
  const site = Array.isArray(siteRaw) ? siteRaw[0] ?? null : siteRaw
  const propertyRaw = wo.properties as { name: string } | { name: string }[] | null
  const propertyName = Array.isArray(propertyRaw) ? propertyRaw[0]?.name ?? '' : propertyRaw?.name ?? ''

  const generatedAt = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Manila',
  }).format(new Date()) + ' PHT'

  const element = React.createElement(ServiceReportPdf, {
    woNumber: wo.wo_number,
    propertyName,
    assetName: asset?.name ?? null,
    buildingName: building?.name ?? null,
    siteName: site?.name ?? null,
    createdAt: wo.created_at,
    report,
    generatedAt,
  }) as ReactElement<DocumentProps, string | JSXElementConstructor<unknown>>

  const buffer = await renderToBuffer(element)

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${wo.wo_number}-service-report.pdf"`,
    },
  })
}
