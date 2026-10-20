import type { SupabaseClient } from '@supabase/supabase-js'
import React, { type ReactElement, type JSXElementConstructor } from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import AuditReportPdf from '@/components/pdf/AuditReportPdf'
import { priorityLabel } from '@/lib/priority'
import { formatRoleName } from '@/lib/roles'
import { generateRecordHash } from '@/lib/token'
import type { WorkOrderEvent } from '@/types'

const BUCKET = 'receipts'

export interface AuditTimelineEntry {
  key: string
  name: string
  email: string | null
  role: string | null
  step: string
  decision: string
  reason: string | null
  at: string
}

export interface AuditCostLine {
  category: string
  description: string
  amount: number
}

export interface AuditFile {
  label: string
  url: string
}

export interface AuditReportData {
  woNumber: string
  propertyName: string
  status: string
  generatedAt: string
  requesterName: string
  requesterEmail: string | null
  tenantLessee: string | null
  location: string | null
  contactPerson: string | null
  contactDetail: string | null
  description: string | null
  workDone: string | null
  priority: string | null
  executionLabel: string
  engineerName: string | null
  dueDate: string | null
  reportedAt: string
  completedAt: string | null
  isCostWaived: boolean
  costWaivedBy: string | null
  costWaivedReason: string | null
  costLines: AuditCostLine[]
  total: number | null
  timeline: AuditTimelineEntry[]
  files: AuditFile[]
  recordHash: string
}

type Rel<T> = T | T[] | null | undefined

function one<T>(value: Rel<T>): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function many<T>(value: Rel<T>): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

interface PersonRow {
  id: string
  full_name: string | null
  email: string | null
  roles: Rel<{ name?: string }>
}

function roleLabel(role: string | null | undefined) {
  return role ? formatRoleName(role, '') || null : null
}

/** Merges logged events with entries derived from older columns so partially-logged orders stay complete. */
export function buildAuditTimeline(
  events: Pick<WorkOrderEvent, 'event_type' | 'step' | 'actor_name' | 'actor_email' | 'actor_role' | 'decision' | 'reason' | 'created_at'>[],
  derived: AuditTimelineEntry[]
) {
  const logged: AuditTimelineEntry[] = events.map((event) => ({
    key: event.event_type,
    name: event.actor_name ?? 'System',
    email: event.actor_email,
    role: roleLabel(event.actor_role),
    step: event.step,
    decision: event.decision ?? '-',
    reason: event.reason,
    at: event.created_at,
  }))

  const loggedKeys = new Set(logged.map((entry) => entry.key))
  const fallback = derived.filter((entry) => !loggedKeys.has(entry.key))

  return [...logged, ...fallback].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
}

function fileNameFromUrl(url: string) {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() ?? url)
  } catch {
    return url
  }
}

export async function loadAuditReportData(
  service: SupabaseClient,
  workOrderId: string
): Promise<AuditReportData | null> {
  const { data: wo } = await service
    .from('work_orders')
    .select(`
      *,
      engineers!work_orders_engineer_id_fkey(id, full_name, email),
      properties(name),
      work_order_reports!work_order_reports_work_order_id_fkey(*),
      work_order_costings!work_order_costings_work_order_id_fkey(*),
      work_order_completion_evidence!work_order_completion_evidence_work_order_id_fkey(*)
    `)
    .eq('id', workOrderId)
    .single()

  if (!wo) return null

  const [{ data: eventRows }, { data: trailRows }] = await Promise.all([
    service.from('work_order_events').select('*').eq('work_order_id', workOrderId).order('created_at'),
    service.from('approval_trail').select('*').eq('work_order_id', workOrderId).order('created_at'),
  ])

  const report = one(wo.work_order_reports as Rel<Record<string, unknown>>) as Record<string, any> | null
  const costing = one(wo.work_order_costings as Rel<Record<string, unknown>>) as Record<string, any> | null
  const evidence = one(wo.work_order_completion_evidence as Rel<Record<string, unknown>>) as Record<string, any> | null
  const engineer = one(wo.engineers as Rel<{ full_name?: string; email?: string }>)
  const property = one(wo.properties as Rel<{ name?: string }>)
  const trail = (trailRows ?? []) as Array<Record<string, any>>
  const events = (eventRows ?? []) as WorkOrderEvent[]

  const personIds = [
    report?.inspected_by_id,
    costing?.submitted_by_id,
    evidence?.submitted_by_id,
    wo.head_engineer_id,
  ].filter((id): id is string => typeof id === 'string')

  const people = new Map<string, PersonRow>()
  if (personIds.length > 0) {
    const { data: personRows } = await service
      .from('engineers')
      .select('id, full_name, email, roles(name)')
      .in('id', personIds)
    for (const person of (personRows ?? []) as unknown as PersonRow[]) people.set(person.id, person)
  }
  const personRole = (person: PersonRow | undefined) => roleLabel(one(person?.roles)?.name)

  const tenantEmail: string | null = wo.tenant_email ?? null
  const derived: AuditTimelineEntry[] = []

  if (report?.created_at) {
    const contact = typeof report.reported_by_contact === 'string' ? report.reported_by_contact : ''
    derived.push({
      key: 'report_submitted',
      name: report.reported_by_name ?? wo.tenant_name ?? 'Tenant',
      email: contact.includes('@') ? contact : tenantEmail,
      role: wo.requested_by_id ? 'Tenant' : null,
      step: 'Service report submitted',
      decision: 'Submitted',
      reason: report.fault_description ?? null,
      at: report.created_at,
    })
  }

  if (report?.inspected_at) {
    const person = people.get(report.inspected_by_id)
    derived.push({
      key: 'inspection_completed',
      name: person?.full_name ?? engineer?.full_name ?? 'Engineer',
      email: person?.email ?? engineer?.email ?? null,
      role: personRole(person),
      step: 'Inspection',
      decision: 'Completed',
      reason: report.inspection_notes ?? null,
      at: report.inspected_at,
    })
  }

  if (costing?.submitted_at) {
    const person = people.get(costing.submitted_by_id)
    derived.push({
      key: 'costing_submitted',
      name: person?.full_name ?? 'Engineer',
      email: person?.email ?? null,
      role: personRole(person),
      step: 'Costing',
      decision: 'Sent for approval',
      reason: costing.notes ?? null,
      at: costing.submitted_at,
    })
  }

  for (const entry of trail.filter((row) => row.stage === 'costing_approval')) {
    const approved = entry.decision === 'approved'
    derived.push({
      key: approved ? 'costing_approved' : 'costing_rejected',
      name: entry.actor_name,
      email: tenantEmail,
      role: 'Tenant',
      step: 'Cost approval',
      decision: approved ? 'Approved' : 'Rejected',
      reason: entry.reason ?? null,
      at: entry.created_at,
    })
  }

  if (evidence?.submitted_at) {
    const person = people.get(evidence.submitted_by_id)
    derived.push({
      key: 'work_submitted',
      name: person?.full_name ?? engineer?.full_name ?? 'Engineer',
      email: person?.email ?? engineer?.email ?? null,
      role: personRole(person),
      step: 'Work execution',
      decision: 'Submitted for verification',
      reason: evidence.work_description ?? null,
      at: evidence.submitted_at,
    })
  }

  if (wo.head_engineer_verified_at) {
    const person = people.get(wo.head_engineer_id)
    const verification = trail.find((row) => row.stage === 'final_verification')
    derived.push({
      key: 'final_verified',
      name: verification?.actor_name ?? person?.full_name ?? 'Head Engineer',
      email: person?.email ?? null,
      role: personRole(person) ?? 'Head Engineer',
      step: 'Final verification',
      decision: 'Approved',
      reason: wo.head_engineer_notes ?? null,
      at: wo.head_engineer_verified_at,
    })
  }

  if (wo.signed_at) {
    const rating = typeof wo.rating === 'number' ? `Rated ${wo.rating}/5` : null
    derived.push({
      key: 'tenant_signed',
      name: wo.signed_by_name ?? wo.tenant_name ?? 'Tenant',
      email: tenantEmail,
      role: 'Tenant',
      step: 'Tenant sign-off',
      decision: 'Approved',
      reason: [rating, wo.rating_comment].filter(Boolean).join(' - ') || null,
      at: wo.signed_at,
    })
  }

  if (wo.cancelled_at) {
    derived.push({
      key: 'cancelled',
      name: wo.cancelled_by_name ?? 'Engineer',
      email: null,
      role: null,
      step: wo.cancelled_stage === 'costing' ? 'Costing cancelled' : 'Request cancelled at inspection',
      decision: 'Cancelled',
      reason: wo.cancellation_reason ?? null,
      at: wo.cancelled_at,
    })
  }

  const timeline = buildAuditTimeline(events, derived)

  const isThirdParty = wo.execution_mode === 'third_party'
  const costLines: AuditCostLine[] = []
  if (costing) {
    const labourTotal = Number(costing.labour_total ?? 0)
    const materials = Number(costing.materials_total ?? 0)
    const subcontractor = Number(costing.subcontractor_total ?? 0)
    if (labourTotal > 0) {
      costLines.push({
        category: 'Labour',
        description: `${Number(costing.labour_hours ?? 0)} hrs at PHP ${Number(costing.labour_rate ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}/hr`,
        amount: labourTotal,
      })
    }
    if (materials > 0) costLines.push({ category: 'Materials', description: 'Materials and consumables', amount: materials })
    if (subcontractor > 0) {
      costLines.push({
        category: isThirdParty ? 'Third-party contractor' : 'Subcontractor',
        description: isThirdParty && wo.contractor_name ? String(wo.contractor_name) : 'Subcontractor charges',
        amount: subcontractor,
      })
    }
  }
  const total = costing ? Number(costing.grand_total ?? costLines.reduce((sum, line) => sum + line.amount, 0)) : null

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  const files: AuditFile[] = []
  const pushFiles = (label: string, urls: unknown) => {
    if (!Array.isArray(urls)) return
    urls.filter((url): url is string => typeof url === 'string' && url.startsWith('http')).forEach((url, index, all) => {
      files.push({ label: `${label}${all.length > 1 ? ` ${index + 1}` : ''} - ${fileNameFromUrl(url)}`, url })
    })
  }
  pushFiles('Service report photo', report?.photo_urls)
  pushFiles('Inspection photo', report?.inspection_photo_urls)
  pushFiles('Completion photo', evidence?.completion_photo_urls)
  pushFiles('Supporting document', evidence?.supporting_doc_urls)
  if (appUrl && costing) files.push({ label: 'Cost estimate (PDF)', url: `${appUrl}/api/pdf/${workOrderId}/costing` })
  if (wo.pdf_url) files.push({ label: 'Signed receipt (PDF)', url: wo.pdf_url })

  const lastEntry = timeline[timeline.length - 1]
  const recordHash = generateRecordHash({
    wo_id: wo.id,
    wo_number: wo.wo_number,
    status: wo.status,
    entries: timeline.length,
    last_at: lastEntry?.at ?? null,
    total,
  })

  const completedAt = wo.status === 'completed' ? wo.signed_at ?? wo.updated_at ?? null : null

  return {
    woNumber: wo.wo_number,
    propertyName: property?.name ?? 'Property',
    status: wo.status,
    generatedAt: new Date().toISOString(),
    requesterName: report?.reported_by_name ?? wo.tenant_name ?? 'Tenant',
    requesterEmail: tenantEmail,
    tenantLessee: report?.tenant_lessee ?? null,
    location: report?.location_notes ?? null,
    contactPerson: report?.reported_by_name ?? null,
    contactDetail: report?.reported_by_contact ?? null,
    description: report?.fault_description ?? null,
    workDone: evidence?.work_description ?? null,
    priority: wo.priority ? priorityLabel(wo.priority) : null,
    executionLabel: isThirdParty
      ? `Third-party contractor${wo.contractor_name ? `: ${wo.contractor_name}` : ''}`
      : 'In-house engineering team',
    engineerName: engineer?.full_name ?? null,
    dueDate: wo.due_date ?? null,
    reportedAt: report?.created_at ?? wo.created_at,
    completedAt,
    isCostWaived: Boolean(wo.is_cost_waived),
    costWaivedBy: wo.cost_waived_by_name ?? null,
    costWaivedReason: wo.cost_waived_reason ?? null,
    costLines,
    total,
    timeline,
    files,
    recordHash,
  }
}

export async function renderAuditReport(data: AuditReportData) {
  const element = React.createElement(AuditReportPdf, { data }) as ReactElement<
    DocumentProps,
    string | JSXElementConstructor<unknown>
  >
  return renderToBuffer(element)
}

/** Renders the audit report, stores it in the receipts bucket and saves the URL on the work order. */
export async function generateAndStoreAuditReport(service: SupabaseClient, workOrderId: string) {
  try {
    const data = await loadAuditReportData(service, workOrderId)
    if (!data) return null

    const buffer = await renderAuditReport(data)
    const fileName = `audit-reports/${data.woNumber}-${workOrderId}.pdf`
    const { error: uploadError } = await service.storage
      .from(BUCKET)
      .upload(fileName, buffer, { contentType: 'application/pdf', upsert: true })
    if (uploadError) throw uploadError

    const { data: { publicUrl } } = service.storage.from(BUCKET).getPublicUrl(fileName)
    await service
      .from('work_orders')
      .update({ audit_report_url: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', workOrderId)

    return publicUrl
  } catch (error) {
    console.error('[audit-report] generation failed:', error)
    return null
  }
}
