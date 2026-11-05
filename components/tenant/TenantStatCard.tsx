import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const TONES = {
  green: 'bg-green-50 text-green-700',
  sky: 'bg-sky-50 text-sky-700',
  amber: 'bg-amber-50 text-amber-700',
} as const

/** Dashboard count that opens the matching Service Reports list. Compact on phones (2 per row). */
export default function TenantStatCard({
  href,
  title,
  value,
  subtitle,
  icon: Icon,
  tone,
  highlight = false,
}: {
  href: string
  title: string
  value: number
  subtitle: string
  icon: LucideIcon
  tone: keyof typeof TONES
  /** Draws attention to a count the tenant must act on. */
  highlight?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group block rounded-xl border bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 sm:p-5',
        highlight ? 'border-amber-300 ring-1 ring-amber-200 hover:border-amber-400' : 'border-gray-200 hover:border-gray-300'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500 sm:text-sm">{title}</p>
          <p className={cn('mt-1 text-2xl font-bold sm:text-3xl', highlight ? 'text-amber-700' : 'text-gray-900')}>{value}</p>
          <p className="mt-1 hidden text-xs text-gray-400 sm:block">{subtitle}</p>
        </div>
        <div className={cn('shrink-0 rounded-lg p-2 sm:p-2.5', TONES[tone])}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
      </div>
    </Link>
  )
}
