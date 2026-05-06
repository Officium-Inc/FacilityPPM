import { cn } from '@/lib/utils'
import type { WorkOrderStatus } from '@/types'

const statusConfig: Record<WorkOrderStatus, { label: string; classes: string }> = {
  scheduled: { label: 'Scheduled', classes: 'bg-gray-100 text-gray-700' },
  assigned: { label: 'Assigned', classes: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'In Progress', classes: 'bg-yellow-100 text-yellow-800' },
  on_hold: { label: 'On Hold', classes: 'bg-orange-100 text-orange-700' },
  completed: { label: 'Completed', classes: 'bg-teal-100 text-teal-700' },
  verified: { label: 'Verified', classes: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelled', classes: 'bg-red-100 text-red-700' },
  overdue: { label: 'Overdue', classes: 'bg-red-100 text-red-700' },
}

export default function StatusBadge({ status }: { status: WorkOrderStatus }) {
  const cfg = statusConfig[status] ?? { label: status, classes: 'bg-gray-100 text-gray-700' }
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', cfg.classes)}>
      {cfg.label}
    </span>
  )
}
