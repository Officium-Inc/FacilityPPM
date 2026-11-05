import Link from 'next/link'
import {
  TENANT_REQUEST_FILTERS,
  TENANT_REQUEST_TITLES,
  tenantRequestsHref,
  type TenantRequestFilter,
} from '@/lib/tenant-requests'
import { cn } from '@/lib/utils'

/** Filter tabs with counts for the Service Reports pages; scrolls sideways on phones, wraps from `sm`. */
export default function TenantRequestTabs({
  slug,
  active,
  counts,
}: {
  slug: string
  active: TenantRequestFilter
  counts: Record<TenantRequestFilter, number>
}) {
  return (
    <nav aria-label="Filter service reports" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
      <div className="flex w-max gap-1 rounded-xl border border-gray-200 bg-white p-1 sm:w-fit sm:max-w-full sm:flex-wrap">
        {TENANT_REQUEST_FILTERS.map((filter) => {
          const isActive = filter === active
          const needsAction = filter === 'for-my-approval' && counts[filter] > 0
          return (
            <Link
              key={filter}
              href={tenantRequestsHref(slug, filter)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600',
                isActive ? 'bg-green-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              {TENANT_REQUEST_TITLES[filter]}
              <span
                className={cn(
                  'min-w-[1.25rem] rounded-full px-1.5 text-center text-xs font-semibold leading-5',
                  isActive
                    ? 'bg-white/20 text-white'
                    : needsAction
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-gray-100 text-gray-600'
                )}
              >
                {counts[filter]}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
