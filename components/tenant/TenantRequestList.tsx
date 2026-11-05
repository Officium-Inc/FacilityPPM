'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronRight, MapPin, Search, X } from 'lucide-react'
import StatusBadge from '@/components/work-orders/StatusBadge'
import {
  matchesTenantSearch,
  TENANT_ACTION_LABELS,
  type TenantRequestListItem,
} from '@/lib/tenant-requests'
import { cn } from '@/lib/utils'

/**
 * Service report rows: stacked cards below `lg`, aligned columns from `lg` (the sidebar leaves too little
 * room for a table before that). Each row is one link; rows waiting for the tenant open the review page.
 */
export default function TenantRequestList({
  items,
  searchable = false,
  showPriority = true,
}: {
  items: TenantRequestListItem[]
  searchable?: boolean
  /** Adds a priority column on wide screens (the dashboard leaves it out). */
  showPriority?: boolean
}) {
  const [query, setQuery] = useState('')
  const visible = useMemo(
    () => (searchable ? items.filter((item) => matchesTenantSearch(item, query)) : items),
    [items, query, searchable]
  )
  const columns = showPriority
    ? 'lg:grid-cols-[minmax(0,1fr)_10.5rem_6rem_5rem] xl:grid-cols-[minmax(0,1fr)_6rem_10.5rem_6rem_5rem]'
    : 'lg:grid-cols-[minmax(0,1fr)_10.5rem_6rem_5rem]'

  return (
    <div>
      {searchable && (
        <div className="border-b border-gray-100 p-3 sm:px-5">
          <label className="relative block">
            <span className="sr-only">Search service reports</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search number, issue or location"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-600/20 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
        </div>
      )}

      <div
        className={cn(
          'hidden gap-4 border-b border-gray-100 bg-gray-50 px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 lg:grid',
          columns
        )}
        aria-hidden="true"
      >
        <span>Report</span>
        {showPriority && <span className="hidden xl:block">Priority</span>}
        <span>Status</span>
        <span>Submitted</span>
        <span />
      </div>

      {visible.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-gray-500">
          No reports match “{query.trim()}”.{' '}
          <button type="button" onClick={() => setQuery('')} className="font-medium text-green-700 hover:underline">
            Clear search
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {visible.map((item) => (
            <li key={item.id}>
              <RequestRow item={item} columns={columns} showPriority={showPriority} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RequestRow({
  item,
  columns,
  showPriority,
}: {
  item: TenantRequestListItem
  columns: string
  showPriority: boolean
}) {
  const action = item.action ? TENANT_ACTION_LABELS[item.action] : null
  const description = item.description ?? 'No description'

  return (
    <Link
      href={item.href}
      className={cn(
        'group block px-4 py-3.5 transition-colors focus-visible:bg-gray-50 focus-visible:outline-none sm:px-5',
        action ? 'bg-amber-50/50 hover:bg-amber-50' : 'hover:bg-gray-50'
      )}
    >
      {/* Phones and tablets: card */}
      <div className="lg:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500">{item.number}</p>
            <p className="mt-0.5 line-clamp-2 text-sm font-medium text-gray-900">{description}</p>
          </div>
          <span className="shrink-0 whitespace-nowrap">
            <StatusBadge status={item.status} />
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          {item.location && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{item.location}</span>
            </span>
          )}
          <span>{item.submitted}</span>
          {showPriority && item.priority && <span>{item.priority} priority</span>}
        </div>
        {action && (
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white group-hover:bg-amber-700">
            {action.button}
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        )}
      </div>

      {/* Desktop: aligned columns */}
      <div className={cn('hidden items-center gap-4 text-sm lg:grid', columns)}>
        <span className="min-w-0">
          <span className="block truncate font-medium text-gray-900">{description}</span>
          <span className="block truncate text-xs text-gray-500">
            {item.number}
            {item.location && <span className="text-gray-400"> · {item.location}</span>}
          </span>
        </span>
        {showPriority && (
          <span className={cn('hidden xl:block', item.priority ? 'text-gray-600' : 'text-gray-400')}>
            {item.priority ?? 'Not assessed'}
          </span>
        )}
        <span className="whitespace-nowrap">
          <StatusBadge status={item.status} />
        </span>
        <span className="whitespace-nowrap text-gray-500">{item.submitted}</span>
        <span className="flex justify-end">
          {action ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-medium text-white group-hover:bg-amber-700">
              Review
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-500" />
          )}
        </span>
      </div>
    </Link>
  )
}
