import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import React, { type ReactElement, type JSXElementConstructor } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import CostingApprovalPdf from '@/components/pdf/CostingApprovalPdf'
import WorkOrderFormPdf from '@/components/pdf/WorkOrderFormPdf'
import { fetchFormPhotoBuffers, loadWorkOrderForm } from '@/lib/work-order-form'

type PdfElement = ReactElement<DocumentProps, string | JSXElementConstructor<unknown>>

export interface RenderedPdf {
  buffer: Buffer
  fileName: string
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

function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

/** The Work Order Request form (service report). Signatures are embedded only when the caller may see them. */
export async function renderWorkOrderFormPdf(
  service: SupabaseClient,
  workOrderId: string,
  options: { includeSignatures: boolean }
): Promise<RenderedPdf | null> {
  const data = await loadWorkOrderForm(service, workOrderId, { includeSignatures: options.includeSignatures })
  if (!data) return null

  const photoBuffers = await fetchFormPhotoBuffers(data.photos)
  const element = React.createElement(WorkOrderFormPdf, { data, photoBuffers }) as PdfElement
  const buffer = await renderToBuffer(element)
  return { buffer: Buffer.from(buffer), fileName: `${data.woNumber}-service-report.pdf` }
}

/** The cost estimate sent to the tenant for approval. Returns null when there is no costing yet. */
export async function renderCostingPdf(service: SupabaseClient, workOrderId: string): Promise<RenderedPdf | null> {
  const { data: wo } = await service
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
    .maybeSingle()

  if (!wo) return null

  const costing = rowsOf(wo.work_order_costings as CostingPdfRow | CostingPdfRow[] | null)[0]
  if (!costing) return null

  const property = first(wo.properties as { name: string } | { name: string }[] | null)
  type SiteRef = { name: string }
  type BuildingRef = { sites: SiteRef | SiteRef[] | null }
  type AssetRef = { buildings: BuildingRef | BuildingRef[] | null }
  const schedule = first(wo.ppm_schedules as unknown as { assets: AssetRef | AssetRef[] | null } | null)
  const site = first(first(first(schedule?.assets)?.buildings)?.sites)

  const generatedAt = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Manila',
  }).format(new Date()) + ' PHT'

  const labour = costing.labour_hours ?? 0
  const rate = costing.labour_rate ?? 0
  const labourTotal = costing.labour_total ?? labour * rate
  const materials = costing.materials_total ?? 0
  const subcontractor = costing.subcontractor_total ?? 0
  const grand = costing.grand_total ?? labourTotal + materials + subcontractor

  const element = React.createElement(CostingApprovalPdf, {
    woNumber: wo.wo_number,
    propertyName: property?.name ?? '',
    siteName: site?.name ?? null,
    labourHours: labour,
    labourRate: rate,
    labourTotal,
    materialsTotal: materials,
    subcontractorTotal: subcontractor,
    grandTotal: grand,
    notes: costing.notes ?? null,
    approvedByName: (wo.costing_approved_by_name as string | null) ?? null,
    approvedAt: (wo.costing_approved_at as string | null) ?? null,
    generatedAt,
  }) as PdfElement

  const buffer = await renderToBuffer(element)
  return { buffer: Buffer.from(buffer), fileName: `${wo.wo_number}-cost-estimate.pdf` }
}
