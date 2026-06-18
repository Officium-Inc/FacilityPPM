import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { createServiceClient } from '@/lib/supabase/server'
import CostingApprovalPdf from '@/components/pdf/CostingApprovalPdf'
import React, { type ReactElement, type JSXElementConstructor } from 'react'

interface Params {
  params: Promise<{ workOrderId: string }>
}

type CostingPdfRow = {
  labour_hours?: number
  labour_rate?: number
  labour_total?: number
  materials_total?: number
  subcontractor_total?: number
  grand_total?: number
  notes?: string | null
}

function rowsOf<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { workOrderId } = await params
  const service = await createServiceClient()

  const { data: wo, error } = await service
    .from('work_orders')
    .select(`
      id, wo_number, costing_approved_at, costing_approved_by_name,
      ppm_schedules(assets(buildings(sites(name)))),
      work_order_costings!work_order_costings_work_order_id_fkey(
        labour_hours, labour_rate, labour_total,
        materials_total, subcontractor_total, grand_total, notes
      ),
      properties(name)
    `)
    .eq('id', workOrderId)
    .single()

  if (error || !wo) {
    return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
  }

  const costings = rowsOf(wo.work_order_costings as CostingPdfRow | CostingPdfRow[] | null)

  if (!costings || costings.length === 0) {
    return NextResponse.json({ error: 'No costing found for this work order' }, { status: 404 })
  }

  const c = costings[0]
  const propertyRaw = wo.properties as { name: string } | { name: string }[] | null
  const propertyName = Array.isArray(propertyRaw) ? propertyRaw[0]?.name ?? '' : propertyRaw?.name ?? ''

  const schedule = wo.ppm_schedules as unknown as { assets: { buildings: { sites: { name: string } | { name: string }[] } } | { buildings: { sites: { name: string } | { name: string }[] } }[] | null } | null
  const assetRaw = schedule?.assets
  const asset = Array.isArray(assetRaw) ? assetRaw[0] ?? null : assetRaw
  const buildingRaw = asset?.buildings
  const building = Array.isArray(buildingRaw) ? buildingRaw[0] ?? null : buildingRaw
  const siteRaw = building?.sites
  const site = Array.isArray(siteRaw) ? siteRaw[0] ?? null : siteRaw

  const generatedAt = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Manila',
  }).format(new Date()) + ' PHT'

  const labour = c.labour_hours ?? 0
  const rate = c.labour_rate ?? 0
  const labourTotal = c.labour_total ?? labour * rate
  const materials = c.materials_total ?? 0
  const subcontractor = c.subcontractor_total ?? 0
  const grand = c.grand_total ?? labourTotal + materials + subcontractor

  const element = React.createElement(CostingApprovalPdf, {
    woNumber: wo.wo_number,
    propertyName,
    siteName: site?.name ?? null,
    labourHours: labour,
    labourRate: rate,
    labourTotal,
    materialsTotal: materials,
    subcontractorTotal: subcontractor,
    grandTotal: grand,
    notes: c.notes ?? null,
    approvedByName: (wo.costing_approved_by_name as string | null) ?? null,
    approvedAt: (wo.costing_approved_at as string | null) ?? null,
    generatedAt,
  }) as ReactElement<DocumentProps, string | JSXElementConstructor<unknown>>

  const buffer = await renderToBuffer(element)

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${wo.wo_number}-cost-estimate.pdf"`,
    },
  })
}
