import Link from 'next/link'
import type { WorkOrder } from '@/types'
import StatusBadge from '@/components/work-orders/StatusBadge'
import { format } from 'date-fns'

interface WorkOrderTableProps {
  workOrders: WorkOrder[]
  slug: string
}

export default function WorkOrderTable({ workOrders, slug }: WorkOrderTableProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 text-sm">Recent Work Orders</h2>
        <Link href={`/${slug}/work-orders`} className="text-xs text-blue-600 hover:underline">
          View all
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">WO #</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Asset</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Engineer</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {workOrders.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-gray-400 text-sm">
                  No work orders found.
                </td>
              </tr>
            ) : (
              workOrders.map((wo) => (
                <tr key={wo.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <Link
                      href={`/${slug}/work-orders/${wo.id}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {wo.wo_number}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-gray-700">
                    {wo.ppm_schedules?.assets?.name ?? '—'}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={wo.status} />
                  </td>
                  <td className="px-5 py-3 text-gray-600">
                    {wo.engineers?.full_name ?? <span className="text-gray-300">Unassigned</span>}
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
  )
}
