import Link from 'next/link'
import { ArrowLeft, CircleSlash } from 'lucide-react'
import type { WorkOrderStatus } from '@/types'
import StatusBadge from './StatusBadge'

interface WorkOrderHeaderProps {
  slug: string
  woNumber: string
  status: WorkOrderStatus
  isCostWaived: boolean
  /** "Reactive · Medium priority · Leaks, 15th Floor" */
  subtitle: string
}

export default function WorkOrderHeader({ slug, woNumber, status, isCostWaived, subtitle }: WorkOrderHeaderProps) {
  return (
    <header className="space-y-3">
      <Link
        href={`/${slug}/work-orders`}
        className="inline-flex items-center gap-1.5 rounded text-sm text-gray-500 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Work Orders
      </Link>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="break-all text-2xl font-bold tracking-tight text-gray-900">{woNumber}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={status} size="md" />
          {isCostWaived && (
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700">
              <CircleSlash className="h-3.5 w-3.5" aria-hidden="true" />
              Cost Waived
            </span>
          )}
        </div>
      </div>
      {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
    </header>
  )
}
