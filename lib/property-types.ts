/**
 * Property types (migration 025). Phase B adds the type-specific wording and structure defaults here.
 * Client-safe (no server imports).
 */
export const PROPERTY_TYPES = ['commercial', 'corporate', 'residential'] as const
export type PropertyType = (typeof PROPERTY_TYPES)[number]

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  commercial: 'Commercial',
  corporate: 'Corporate',
  residential: 'Residential',
}

export const PROPERTY_TYPE_DESCRIPTIONS: Record<PropertyType, string> = {
  commercial: 'Office or retail building leased to tenant companies',
  corporate: "A company's own building, occupied by its departments",
  residential: 'Condominium, apartments or a house, occupied by households',
}

export function isPropertyType(value: unknown): value is PropertyType {
  return typeof value === 'string' && (PROPERTY_TYPES as readonly string[]).includes(value)
}

export function propertyTypeLabel(value: string | null | undefined) {
  return isPropertyType(value) ? PROPERTY_TYPE_LABELS[value] : PROPERTY_TYPE_LABELS.commercial
}
