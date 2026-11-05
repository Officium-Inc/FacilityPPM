import type { SupabaseClient } from '@supabase/supabase-js'
import type { Floor, FloorOccupancy, TenantCompany } from '@/types'

export interface FloorWithTenant extends Floor {
  occupancy: FloorOccupancy | null
  company: TenantCompany | null
}

export interface CompanyWithFloors extends TenantCompany {
  floors: Floor[]
}

export function sortFloors<T extends Pick<Floor, 'sort_order' | 'label'>>(floors: T[]) {
  return [...floors].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, undefined, { numeric: true }))
}

/** Floors with their current company, and companies with their current floors, for one property. */
export async function loadFloorsAndCompanies(service: SupabaseClient, propertyId: string) {
  const [{ data: floorRows }, { data: companyRows }, { data: occupancyRows }] = await Promise.all([
    service.from('floors').select('*').eq('property_id', propertyId),
    service.from('tenant_companies').select('*').eq('property_id', propertyId).order('name'),
    service.from('floor_occupancies').select('*').eq('property_id', propertyId).is('ends_on', null),
  ])

  const companies = (companyRows ?? []) as TenantCompany[]
  const occupancies = (occupancyRows ?? []) as FloorOccupancy[]
  const companyById = new Map(companies.map((company) => [company.id, company]))
  const occupancyByFloor = new Map(occupancies.map((occupancy) => [occupancy.floor_id, occupancy]))

  const floors: FloorWithTenant[] = sortFloors((floorRows ?? []) as Floor[]).map((floor) => {
    const occupancy = occupancyByFloor.get(floor.id) ?? null
    return { ...floor, occupancy, company: occupancy ? companyById.get(occupancy.company_id) ?? null : null }
  })

  const companiesWithFloors: CompanyWithFloors[] = companies.map((company) => ({
    ...company,
    floors: floors.filter((floor) => floor.company?.id === company.id),
  }))

  return { floors, companies: companiesWithFloors }
}

/** The floors a company currently occupies. */
export async function loadCompanyFloors(service: SupabaseClient, propertyId: string, companyId: string): Promise<Floor[]> {
  const { data } = await service
    .from('floor_occupancies')
    .select('floors(*)')
    .eq('property_id', propertyId)
    .eq('company_id', companyId)
    .is('ends_on', null)

  const floors = (data ?? []).flatMap((row) => {
    const value = (row as { floors: Floor | Floor[] | null }).floors
    return Array.isArray(value) ? value : value ? [value] : []
  })
  return sortFloors(floors)
}

/**
 * Picks the floor for a new work request: the requested floor must be one of the company's current floors;
 * a company with a single floor gets it automatically; a company without floors submits without one.
 */
export async function resolveRequestFloor(
  service: SupabaseClient,
  propertyId: string,
  companyId: string,
  requestedFloorId: string | null | undefined
): Promise<{ ok: true; floorId: string | null } | { ok: false; error: string }> {
  const floors = await loadCompanyFloors(service, propertyId, companyId)

  if (requestedFloorId) {
    return floors.some((floor) => floor.id === requestedFloorId)
      ? { ok: true, floorId: requestedFloorId }
      : { ok: false, error: "Select one of the company's floors." }
  }
  if (floors.length === 1) return { ok: true, floorId: floors[0].id }
  if (floors.length === 0) return { ok: true, floorId: null }
  return { ok: false, error: 'Select the floor where the work is needed.' }
}

/** Display label for a floor, e.g. "Floor 12". */
export function floorLabel(floor: Pick<Floor, 'label'> | null | undefined, fallback = '—') {
  return floor?.label ?? fallback
}
