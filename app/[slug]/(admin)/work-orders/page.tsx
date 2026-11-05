import Link from 'next/link'
import StatusBadge from '@/components/work-orders/StatusBadge'
import WorkOrderFilters from '@/components/work-orders/WorkOrderFilters'
import { formatPHT } from '@/lib/utils'
import { requirePage } from '@/lib/authz/guard'
import { can } from '@/lib/authz/permissions'
import type { WorkOrder, Priority } from '@/types'
import { Ban } from 'lucide-react'
import NewWorkOrderModal from './NewWorkOrderModal'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ q?: string; status?: string; priority?: string; type?: string; company?: string }>
}

function PriorityBadge({ priority }: { priority: Priority | null }) {
  const map: Record<Priority, string> = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${priority ? map[priority] : 'bg-gray-50 text-gray-400 normal-case'}`}>
      {priority ?? 'Not assessed'}
    </span>
  )
}

export default async function WorkOrdersPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { q = '', status = '', priority = '', type = '', company = '' } = await searchParams
  const { service, property, actor } = await requirePage(slug, 'workRequest.view')
  const propertyId = property.id

  // Service Group members only list the work assigned to them (D14)
  let workOrderQuery = service
    .from('work_orders')
    .select(`
      *,
      engineers!work_orders_engineer_id_fkey(id, full_name),
      floors(label),
      ppm_schedules(id, title, assets(id, name, buildings(id, name, sites(id, name))))
    `)
    .eq('property_id', propertyId)
  if (actor.kind === 'member' && actor.role === 'service_group') {
    workOrderQuery = workOrderQuery.eq('engineer_id', actor.engineerId)
  }
  const canCreate = can(actor, 'maintenance.manage')

  const [{ data: workOrders }, { data: rawSchedules }, { data: engineersList }, { data: companyRows }] = await Promise.all([
    workOrderQuery.order('scheduled_date', { ascending: true }),
    service
      .from('ppm_schedules')
      .select('id, title, assets!inner(id, name, buildings!inner(sites!inner(property_id)))')
      .eq('assets.buildings.sites.property_id', propertyId)
      .eq('is_active', true)
      .order('title'),
    service
      .from('engineers')
      .select('id, full_name')
      .eq('property_id', propertyId)
      .eq('is_active', true)
      .order('full_name'),
    service
      .from('tenant_companies')
      .select('id, name')
      .eq('property_id', propertyId)
      .order('name'),
  ])
  const companies = (companyRows ?? []) as Array<{ id: string; name: string }>
  const companyNames = new Map(companies.map((row) => [row.id, row.name]))

  const schedules = (rawSchedules ?? []).map((s) => ({
    id: s.id as string,
    title: s.title as string,
    assets: Array.isArray(s.assets) ? (s.assets[0] as { id: string; name: string } | undefined) ?? null : (s.assets as { id: string; name: string } | null),
  }))

  const all = (workOrders as Array<WorkOrder & { floors?: { label: string } | { label: string }[] | null }>) ?? []

  // Apply filters in-memory (avoids complex cross-table DB query for search)
  const ql = q.toLowerCase()
  const wos = all.filter((wo) => {
    if (status && wo.status !== status) return false
    if (priority && wo.priority !== priority) return false
    if (type && wo.type !== type) return false
    if (company && (company === 'none' ? wo.company_id : wo.company_id !== company)) return false
    if (ql) {
      const assetName = wo.ppm_schedules?.assets?.name?.toLowerCase() ?? ''
      const woNum = wo.wo_number?.toLowerCase() ?? ''
      const companyName = (wo.company_id && companyNames.get(wo.company_id)?.toLowerCase()) || ''
      if (!woNum.includes(ql) && !assetName.includes(ql) && !companyName.includes(ql)) return false
    }
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Work Orders</h2>
          <p className="text-sm text-gray-500 mt-0.5">{all.length} total</p>
        </div>
        {canCreate && <NewWorkOrderModal slug={slug} schedules={schedules} engineers={engineersList ?? []} />}
      </div>

      <WorkOrderFilters total={all.length} filtered={wos.length} companies={companies} />

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['WO #', 'Asset', 'Company / Floor', 'Type', 'Priority', 'Status', 'Engineer', 'Due Date'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {wos.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-gray-400">
                    No work orders found.
                  </td>
                </tr>
              ) : (
                wos.map((wo) => {
                  const floor = Array.isArray(wo.floors) ? wo.floors[0] : wo.floors
                  return (
                  <tr key={wo.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <Link
                        href={`/${slug}/work-orders/${wo.id}`}
                        className="font-medium text-green-700 hover:underline"
                      >
                        {wo.wo_number}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-gray-700">
                      {wo.ppm_schedules?.assets?.name ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {wo.company_id ? (
                        <>
                          <div>{companyNames.get(wo.company_id) ?? '—'}</div>
                          {floor && <div className="text-xs text-gray-400">{floor.label}</div>}
                        </>
                      ) : (
                        wo.ppm_schedules?.assets?.buildings?.sites?.name ?? '—'
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-600 capitalize">{wo.type}</td>
                    <td className="px-5 py-3">
                      <PriorityBadge priority={wo.priority} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={wo.status} />
                        {wo.is_cost_waived && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                            <Ban className="w-3 h-3" /> Waived
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {wo.engineers?.full_name ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {formatPHT(wo.scheduled_date)}
                    </td>
                  </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
