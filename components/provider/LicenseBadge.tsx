import type { LicenseStatus } from '@/types'
import { cn } from '@/lib/utils'

const config: Record<LicenseStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-green-100 text-green-700' },
  trial: { label: 'Trial', className: 'bg-yellow-100 text-yellow-700' },
  suspended: { label: 'Suspended', className: 'bg-red-100 text-red-700' },
}

export default function LicenseBadge({ status }: { status: LicenseStatus }) {
  const { label, className } = config[status] ?? config.trial
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize', className)}>
      {label}
    </span>
  )
}
