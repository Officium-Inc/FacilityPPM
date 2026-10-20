import type { CostingLineItem, ProvidedBy } from '@/types'

export const PROVIDED_BY_OPTIONS: { value: ProvidedBy; label: string }[] = [
  { value: 'engineering', label: 'Engineering & Maintenance' },
  { value: 'tenant', label: 'Tenant / Lessee' },
  { value: 'contractor', label: 'Third-party contractor' },
]

const PROVIDED_BY_VALUES = new Set<string>(PROVIDED_BY_OPTIONS.map((option) => option.value))

export function isProvidedBy(value: unknown): value is ProvidedBy {
  return typeof value === 'string' && PROVIDED_BY_VALUES.has(value)
}

export function providedByLabel(value: ProvidedBy | undefined) {
  return PROVIDED_BY_OPTIONS.find((option) => option.value === (value ?? 'engineering'))?.label ?? ''
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

export function lineItemTotal(item: Pick<CostingLineItem, 'qty' | 'unit_cost'>) {
  return roundMoney(item.qty * item.unit_cost)
}

/** Keeps only well-formed rows from untrusted input (blank rows are dropped). */
export function normalizeLineItems(value: unknown): CostingLineItem[] {
  if (!Array.isArray(value)) return []

  const items: CostingLineItem[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    const description = typeof row.description === 'string' ? row.description.trim() : ''
    if (!description) continue

    const qty = Number(row.qty)
    const unitCost = Number(row.unit_cost)
    items.push({
      description: description.slice(0, 200),
      qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
      unit: typeof row.unit === 'string' && row.unit.trim() ? row.unit.trim().slice(0, 20) : undefined,
      unit_cost: Number.isFinite(unitCost) && unitCost > 0 ? roundMoney(unitCost) : 0,
      provided_by: isProvidedBy(row.provided_by) ? row.provided_by : 'engineering',
    })
  }
  return items.slice(0, 50)
}

/**
 * Charges payable to the corporation: engineering lines count as materials, contractor lines as
 * subcontractor cost. Lines supplied by the tenant are listed on the form but never charged.
 */
export function summarizeLineItems(items: CostingLineItem[]) {
  let materialsTotal = 0
  let subcontractorTotal = 0
  for (const item of items) {
    const provider = item.provided_by ?? 'engineering'
    if (provider === 'engineering') materialsTotal += lineItemTotal(item)
    else if (provider === 'contractor') subcontractorTotal += lineItemTotal(item)
  }
  return { materialsTotal: roundMoney(materialsTotal), subcontractorTotal: roundMoney(subcontractorTotal) }
}

/** "2 pcs", "1" - quantity with its unit for display. */
export function formatQtyUnit(item: Pick<CostingLineItem, 'qty' | 'unit'>) {
  return `${item.qty}${item.unit ? ` ${item.unit}` : ''}`
}

/**
 * Line items for a stored costing. Estimates saved before line items existed only have totals,
 * so those become "Materials" / "Subcontractor" rows that add up to the same amounts.
 */
export function costingToLineItems(costing: {
  line_items?: unknown
  materials_total?: number | string | null
  subcontractor_total?: number | string | null
} | null | undefined): CostingLineItem[] {
  if (!costing) return []

  const items = normalizeLineItems(costing.line_items)
  if (items.length > 0) return items

  const materials = Number(costing.materials_total ?? 0)
  const subcontractor = Number(costing.subcontractor_total ?? 0)
  const legacy: CostingLineItem[] = []
  if (materials > 0) legacy.push({ description: 'Materials', qty: 1, unit_cost: materials, provided_by: 'engineering' })
  if (subcontractor > 0) legacy.push({ description: 'Subcontractor', qty: 1, unit_cost: subcontractor, provided_by: 'contractor' })
  return legacy
}
