import WaivedOrdersClient from './WaivedOrdersClient'
import { requirePage } from '@/lib/authz/guard'
import { can } from '@/lib/authz/permissions'
import type { WorkOrder } from '@/types'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function WaivedOrdersPage({ params }: Props) {
  const { slug } = await params
  // Administrators and Property Managers see the list; only Property Managers waive (D8)
  const { service, property, actor } = await requirePage(slug, 'workRequest.waivedList')

  // Show all work orders except those still in pre-cost-approval stages
  const { data: workOrders } = await service
    .from('work_orders')
    .select('id, wo_number, status, priority, type, created_at, is_cost_waived, cost_waived_at, cost_waived_by_name, cost_waived_reason, engineers!work_orders_engineer_id_fkey(full_name)')
    .eq('property_id', property.id)
    .not('status', 'in', '("new_report","inspecting","costing","pending_approval")')
    .order('created_at', { ascending: false })

  const wos = (workOrders ?? []) as unknown as Array<WorkOrder & { engineers: { full_name: string } | null }>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Waived Orders</h2>
        <p className="text-sm text-gray-500 mt-0.5">Work orders with tenant-approved costs — Property Manager can waive associated costs</p>
      </div>
      <WaivedOrdersClient workOrders={wos} slug={slug} canWaive={can(actor, 'workRequest.waive')} />
    </div>
  )
}
