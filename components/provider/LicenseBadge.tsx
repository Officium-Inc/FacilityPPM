import type { LicenseState } from '@/lib/provider/license'
import { cn } from '@/lib/utils'

const config: Record<LicenseState | 'terminated', { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-green-100 text-green-700' },
  trial: { label: 'Trial', className: 'bg-yellow-100 text-yellow-700' },
  suspended: { label: 'Suspended', className: 'bg-red-100 text-red-700' },
  expired: { label: 'Expired', className: 'bg-orange-100 text-orange-700' },
  terminated: { label: 'Terminated', className: 'bg-gray-800 text-white' },
}

export default function LicenseBadge({ status }: { status: LicenseState | 'terminated' }) {
  const { label, className } = config[status] ?? config.suspended
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize', className)}>
      {label}
    </span>
  )
}