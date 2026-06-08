import { cn } from '@/lib/utils'
import type { WorkOrderStatus } from '@/types'

const statusConfig: Record<WorkOrderStatus, { label: string; classes: string }> = {
  // Legacy
  scheduled:        { label: 'Scheduled',        classes: 'bg-gray-100 text-gray-700' },
  on_hold:          { label: 'On Hold',           classes: 'bg-orange-100 text-orange-700' },
  cancelled:        { label: 'Cancelled',         classes: 'bg-red-100 text-red-700' },
  overdue:          { label: 'Overdue',           classes: 'bg-red-100 text-red-700' },
  // Workflow v2
  new_report:       { label: 'New Report',        classes: 'bg-purple-100 text-purple-700' },
  inspecting:       { label: 'Inspecting',        classes: 'bg-blue-100 text-blue-700' },
  costing:          { label: 'Costing',           classes: 'bg-indigo-100 text-indigo-700' },
  pending_approval: { label: 'Pending Approval',  classes: 'bg-amber-100 text-amber-700' },
  assigned:         { label: 'Assigned',          classes: 'bg-sky-100 text-sky-700' },
  in_progress:      { label: 'In Progress',       classes: 'bg-yellow-100 text-yellow-800' },
  svc_submitted:    { label: 'Svc. Submitted',    classes: 'bg-cyan-100 text-cyan-700' },
  signed:           { label: 'Signed',            classes: 'bg-teal-100 text-teal-700' },
  verified:         { label: 'Verified',          classes: 'bg-green-100 text-green-700' },
  completed:        { label: 'Completed',         classes: 'bg-green-200 text-green-800' },
}

export default function StatusBadge({ status }: { status: WorkOrderStatus }) {
  const cfg = statusConfig[status] ?? { label: status, classes: 'bg-gray-100 text-gray-700' }
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', cfg.classes)}>
      {cfg.label}
    </span>
  )
}
