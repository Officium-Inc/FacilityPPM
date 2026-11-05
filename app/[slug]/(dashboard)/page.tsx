import KpiCard from '@/components/dashboard/KpiCard'
import WorkOrderTable from '@/components/dashboard/WorkOrderTable'
import EngineerWorkload from '@/components/dashboard/EngineerWorkload'
import PpmCalendar from '@/components/dashboard/PpmCalendar'
import { CheckCircle, ClipboardList, Package, Users } from 'lucide-react'
import { roleNameFromRelation } from '@/lib/roles'
import { requirePage } from '@/lib/authz/guard'
import { can } from '@/lib/authz/permissions'
import type { WorkOrder } from '@/types'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function DashboardPage({ params }: Props) {
  const { slug } = await params
  const { service, property, actor } = await requirePage(slug, 'portal.admin')
  const propertyId = property.id

  // Service Group members only see the work assigned to them (D14)
  const seesAllWork = can(actor, 'maintenance.view')
  let workOrderQuery = service
    .from('work_orders')
    .select(`*, engineers!work_orders_engineer_id_fkey(id, full_name), ppm_schedules(id, title, assets(id, name))`)
    .eq('property_id', propertyId)
  if (!seesAllWork && actor.kind === 'member') workOrderQuery = workOrderQuery.eq('engineer_id', actor.engineerId)

  const [
    { data: workOrders },
    { count: assetCount },
    { data: engineers },
    { data: schedules },
  ] = await Promise.all([
    workOrderQuery
      .order('created_at', { ascending: false })
      .limit(10),
    service
      .from('assets')
      .select('id, buildings!inner(sites!inner(property_id))', { count: 'exact', head: true })
      .eq('buildings.sites.property_id', propertyId)
      .eq('status', 'active'),
    service
      .from('engineers')
      .select('id, full_name, is_active, roles(name)')
      .eq('property_id', propertyId)
      .eq('is_active', true),
    service
      .from('ppm_schedules')
      .select('next_due, assets!inner(buildings!inner(sites!inner(property_id)))')
      .eq('assets.buildings.sites.property_id', propertyId)
      .eq('is_active', true)
      .not('next_due', 'is', null),
  ])

  const wos = (workOrders as WorkOrder[]) ?? []
  const totalWOs = wos.length
  const completedOrVerified = wos.filter((wo) => wo.status === 'completed').length
  const completionRate =
    totalWOs > 0 ? Math.round((completedOrVerified / totalWOs) * 100) : 0
  const openWOs = wos.filter(
    (wo) => wo.status !== 'completed' && wo.status !== 'cancelled'
  ).length

  const allEngineers = (engineers ?? []) as unknown as Array<{ id: string; full_name: string; is_active: boolean; roles: unknown }>
  const serviceGroupEngineers = allEngineers.filter(
    (e) => roleNameFromRelation(e.roles) === 'service_group'
  )

  const engineerWorkloadMap: Record<string, number> = {}
  wos.forEach((wo) => {
    if (wo.engineer_id && wo.engineers) {
      const name = (wo.engineers as { full_name: string }).full_name
      engineerWorkloadMap[name] = (engineerWorkloadMap[name] ?? 0) + 1
    }
  })
  const maxWOs = Math.max(...Object.values(engineerWorkloadMap), 1)
  const engineerWorkload = serviceGroupEngineers.map((eng) => ({
    full_name: eng.full_name,
    workload: Math.round(((engineerWorkloadMap[eng.full_name] ?? 0) / maxWOs) * 100),
  }))

  const dueDates = (schedules ?? [])
    .map((s) => s.next_due as string)
    .filter(Boolean)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-sm text-gray-500 mt-0.5">Overview of all maintenance activity</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title="PPM Completion Rate"
          value={`${completionRate}%`}
          subtitle={`${completedOrVerified} of ${totalWOs} work orders`}
          icon={CheckCircle}
          color="green"
        />
        <KpiCard
          title="Open Work Orders"
          value={openWOs}
          subtitle="Scheduled, assigned, in progress"
          icon={ClipboardList}
          color="blue"
        />
        <KpiCard
          title="Assets Tracked"
          value={assetCount ?? 0}
          subtitle="Active assets"
          icon={Package}
          color="yellow"
        />
        <KpiCard
          title="Active Service Team"
          value={serviceGroupEngineers.length}
          subtitle="Service group members"
          icon={Users}
          color="blue"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <WorkOrderTable workOrders={wos} slug={slug} />
        </div>
        <div className="space-y-6">
          <EngineerWorkload engineers={engineerWorkload} />
          <PpmCalendar dueDates={dueDates} />
        </div>
      </div>
    </div>
  )
}
