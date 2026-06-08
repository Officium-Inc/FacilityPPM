import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import StatusBadge from '@/components/work-orders/StatusBadge'
import { format } from 'date-fns'
import type { WorkOrder, Priority } from '@/types'
import { Plus } from 'lucide-react'

interface Props {
  params: Promise<{ slug: string }>
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const map: Record<Priority, string> = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${map[priority]}`}>
      {priority}
    </span>
  )
}

export default async function WorkOrdersPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const propertyId = user?.app_metadata?.property_id as string | undefined

  const { data: workOrders } = await supabase
    .from('work_orders')
    .select(`
      *,
      engineers(id, full_name),
      ppm_schedules(id, title, assets(id, name, buildings(id, name, sites(id, name))))
    `)
    .eq('property_id', propertyId ?? '')
    .order('scheduled_date', { ascending: true })

  const wos = (workOrders as WorkOrder[]) ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Work Orders</h2>
          <p className="text-sm text-gray-500 mt-0.5">{wos.length} total</p>
        </div>
        <Link
          href={`/${slug}/work-orders/new`}
          className="inline-flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Work Order
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['WO #', 'Asset', 'Site', 'Type', 'Priority', 'Status', 'Engineer', 'Due Date'].map((h) => (
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
                wos.map((wo) => (
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
                      {wo.ppm_schedules?.assets?.buildings?.sites?.name ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-600 capitalize">{wo.type}</td>
                    <td className="px-5 py-3">
                      <PriorityBadge priority={wo.priority} />
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={wo.status} />
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {wo.engineers?.full_name ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {wo.scheduled_date
                        ? format(new Date(wo.scheduled_date), 'dd MMM yyyy')
                        : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
