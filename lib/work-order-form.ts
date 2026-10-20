import type { SupabaseClient } from '@supabase/supabase-js'
import { costingToLineItems, formatQtyUnit, lineItemTotal, providedByLabel, roundMoney } from '@/lib/costing'
import { getPriorityOption } from '@/lib/priority'
import { formatRoleName } from '@/lib/roles'
import { toPdfJpeg } from '@/lib/image-upload'
import { DEFAULT_WORK_ORDER_TERMS } from '@/lib/work-order-terms'

export const FORM_TITLE = 'WORK ORDER REQUEST'
export const FORM_SUBTITLE = 'Maintenance and Engineering Service Report'
export const MIN_COST_ROWS = 4
export const ACKNOWLEDGMENT_ROWS = 3
const MAX_FORM_PHOTOS = 6

export interface FormPerson {
  name: string | null
  position: string | null
}

export interface FormCostRow {
  description: string
  qtyUnit: string
  providedBy: string
  unitCost: number | null
  totalCost: number | null
  /** Supplied by the tenant: shown for reference but not charged. */
  excluded: boolean
}

export interface FormAcknowledgment {
  technician: string | null
  date: string | null
  acknowledgedBy: string | null
  signature: string | null
  signedAt: string | null
}

export interface WorkOrderFormData {
  status: string
  corporation: string
  addressLine: string | null
  contactLine: string | null
  title: string
  subtitle: string
  date: string | null
  woNumber: string
  tenantLessee: string | null
  contactPerson: string | null
  contactDetail: string | null
  location: string | null
  startAt: string | null
  completedAt: string | null
  serviceProvider: string
  serviceContact: string | null
  leadTime: string | null
  description: string | null
  photos: string[]
  costRows: FormCostRow[]
  hasExcludedRows: boolean
  estimatedTotal: number | null
  terms: string
  preparedBy: FormPerson
  notedBy: FormPerson
  tenantApproval: { name: string | null; date: string | null; signature: string | null }
  acknowledgments: FormAcknowledgment[]
}

type Rel<T> = T | T[] | null | undefined

function one<T>(value: Rel<T>): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

interface PersonRow {
  id: string
  full_name: string | null
  roles: Rel<{ name?: string }>
}

function present(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Builds the Work Order Request form for a work order. It fills in as the workflow progresses. */
export async function loadWorkOrderForm(
  service: SupabaseClient,
  workOrderId: string,
  options: { includeSignatures?: boolean } = {}
): Promise<WorkOrderFormData | null> {
  const { data: wo } = await service
    .from('work_orders')
    .select(`
      *,
      engineers!work_orders_engineer_id_fkey(id, full_name, email, roles(name)),
      properties(*),
      work_order_reports!work_order_reports_work_order_id_fkey(*),
      work_order_costings!work_order_costings_work_order_id_fkey(*),
      work_order_completion_evidence!work_order_completion_evidence_work_order_id_fkey(*)
    `)
    .eq('id', workOrderId)
    .single()

  if (!wo) return null

  const report = one(wo.work_order_reports as Rel<Record<string, any>>)
  const costing = one(wo.work_order_costings as Rel<Record<string, any>>)
  const evidence = one(wo.work_order_completion_evidence as Rel<Record<string, any>>)
  const property = one(wo.properties as Rel<Record<string, any>>)
  const engineer = one(wo.engineers as Rel<PersonRow>)

  const [{ data: assignedEvents }, { data: trailRows }] = await Promise.all([
    service
      .from('work_order_events')
      .select('created_at')
      .eq('work_order_id', workOrderId)
      .eq('event_type', 'assigned')
      .order('created_at', { ascending: true })
      .limit(1),
    service
      .from('approval_trail')
      .select('stage, actor_name')
      .eq('work_order_id', workOrderId)
      .eq('stage', 'final_verification')
      .limit(1),
  ])

  const personIds = [report?.inspected_by_id, costing?.submitted_by_id, wo.head_engineer_id, evidence?.submitted_by_id]
    .filter((id): id is string => typeof id === 'string')
  const people = new Map<string, PersonRow>()
  if (personIds.length > 0) {
    const { data: personRows } = await service
      .from('engineers')
      .select('id, full_name, roles(name)')
      .in('id', personIds)
    for (const person of (personRows ?? []) as unknown as PersonRow[]) people.set(person.id, person)
  }
  const personOf = (person: PersonRow | null | undefined): FormPerson => ({
    name: present(person?.full_name),
    position: present(formatRoleName(one(person?.roles)?.name, '')),
  })

  const corporation = present(property?.legal_name) ?? present(property?.name) ?? 'Property'
  const phone = present(property?.contact_phone)
  const fax = present(property?.fax)
  const contactParts = [phone ? `Tel. Nos. ${phone}` : null, fax ? `Fax ${fax}` : null].filter(Boolean)

  const isThirdParty = wo.execution_mode === 'third_party'
  const contractorName = present(wo.contractor_name)
  const engineerName = present(engineer?.full_name)

  // Materials, Tools and Labor: a labour row followed by the line items.
  const costRows: FormCostRow[] = []
  let estimatedTotal: number | null = null
  if (costing) {
    const labourTotal = Number(costing.labour_total ?? 0)
    const labourHours = Number(costing.labour_hours ?? 0)
    if (labourTotal > 0) {
      costRows.push({
        description: 'Labour',
        qtyUnit: `${labourHours} hr`,
        providedBy: providedByLabel('engineering'),
        unitCost: Number(costing.labour_rate ?? 0),
        totalCost: labourTotal,
        excluded: false,
      })
    }
    for (const item of costingToLineItems(costing)) {
      const excluded = item.provided_by === 'tenant'
      costRows.push({
        description: item.description,
        qtyUnit: formatQtyUnit(item),
        providedBy: providedByLabel(item.provided_by),
        unitCost: item.unit_cost,
        totalCost: lineItemTotal(item),
        excluded,
      })
    }
    estimatedTotal = roundMoney(Number(costing.grand_total ?? 0))
  }

  const preparedPerson = people.get(costing?.submitted_by_id) ?? people.get(report?.inspected_by_id) ?? engineer
  const headEngineer = people.get(wo.head_engineer_id)
  const verification = (trailRows ?? [])[0] as { actor_name?: string } | undefined
  const notedBy: FormPerson = headEngineer
    ? personOf(headEngineer)
    : { name: present(verification?.actor_name), position: null }

  const photos = (Array.isArray(report?.photo_urls) ? report.photo_urls : [])
    .filter((url: unknown): url is string => typeof url === 'string' && url.startsWith('http'))
    .slice(0, MAX_FORM_PHOTOS)

  const technician = present(people.get(evidence?.submitted_by_id)?.full_name) ?? engineerName
  const acknowledgments: FormAcknowledgment[] = Array.from({ length: ACKNOWLEDGMENT_ROWS }, () => ({
    technician: null, date: null, acknowledgedBy: null, signature: null, signedAt: null,
  }))
  if (evidence?.submitted_at || wo.signed_at) {
    acknowledgments[0] = {
      technician,
      date: evidence?.submitted_at ?? null,
      acknowledgedBy: present(wo.signed_by_name),
      signature: options.includeSignatures ? present(wo.signature_data) : null,
      signedAt: wo.signed_at ?? null,
    }
  }

  return {
    status: wo.status,
    corporation,
    addressLine: [property?.address, property?.city, property?.country].map(present).filter(Boolean).join(', ') || null,
    contactLine: contactParts.length > 0 ? contactParts.join('  |  ') : null,
    title: FORM_TITLE,
    subtitle: FORM_SUBTITLE,
    date: report?.created_at ?? wo.created_at ?? null,
    woNumber: wo.wo_number,
    tenantLessee: present(report?.tenant_lessee),
    contactPerson: present(report?.reported_by_name),
    contactDetail: present(report?.reported_by_contact),
    location: present(report?.location_notes),
    startAt: (assignedEvents ?? [])[0]?.created_at ?? null,
    completedAt: evidence?.submitted_at ?? wo.signed_at ?? null,
    serviceProvider: isThirdParty && contractorName ? contractorName : corporation,
    serviceContact: isThirdParty ? present(wo.contractor_contact) ?? engineerName : engineerName,
    leadTime: getPriorityOption(wo.priority)?.sla ?? null,
    description: present(report?.fault_description),
    photos,
    costRows,
    hasExcludedRows: costRows.some((row) => row.excluded),
    estimatedTotal,
    terms: present(property?.work_order_terms) ?? DEFAULT_WORK_ORDER_TERMS,
    preparedBy: personOf(preparedPerson),
    notedBy,
    tenantApproval: {
      name: present(wo.costing_approved_by_name),
      date: wo.costing_approved_at ?? null,
      signature: options.includeSignatures ? present(wo.costing_approval_signature) : null,
    },
    acknowledgments,
  }
}

/** Only photos stored in our own Supabase storage are fetched (they come from user-supplied URLs). */
function isTrustedPhotoUrl(url: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return false
  try {
    return new URL(url).origin === new URL(base).origin
  } catch {
    return false
  }
}

/** Downloads the report photos as JPEG buffers for embedding in the PDF; failures are skipped. */
export async function fetchFormPhotoBuffers(urls: string[]): Promise<Buffer[]> {
  const buffers = await Promise.all(
    urls.filter(isTrustedPhotoUrl).map(async (url) => {
      try {
        const response = await fetch(url)
        if (!response.ok) return null
        return await toPdfJpeg(Buffer.from(await response.arrayBuffer()))
      } catch {
        return null
      }
    })
  )
  return buffers.filter((buffer): buffer is Buffer => buffer !== null)
}
