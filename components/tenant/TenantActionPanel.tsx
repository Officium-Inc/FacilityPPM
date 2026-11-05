import Link from 'next/link'
import { ArrowRight, ClipboardCheck } from 'lucide-react'
import { formatPeso } from '@/lib/costing'
import { TENANT_ACTION_LABELS, type TenantAction, type TenantRequestListItem } from '@/lib/tenant-requests'

const SHOWN = 3

export type TenantActionItem = TenantRequestListItem & { action: TenantAction; estimateTotal: number | null }

/** Dashboard panel listing the reports waiting for the tenant's approval or sign-off. */
export default function TenantActionPanel({ items, allHref }: { items: TenantActionItem[]; allHref: string }) {
  if (items.length === 0) return null

  return (
    <section className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50" aria-labelledby="tenant-action-title">
      <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
        <div className="shrink-0 rounded-lg bg-amber-100 p-2 text-amber-700">
          <ClipboardCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 id="tenant-action-title" className="text-sm font-semibold text-amber-900">
            {items.length === 1 ? '1 report needs your action' : `${items.length} reports need your action`}
          </h3>
          <p className="mt-0.5 text-xs text-amber-800">
            The property team is waiting on you before the work can move on.
          </p>
        </div>
      </div>

      <ul className="divide-y divide-amber-200/70 border-t border-amber-200/70 bg-white/60">
        {items.slice(0, SHOWN).map((item) => {
          const labels = TENANT_ACTION_LABELS[item.action]
          return (
            <li key={item.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {labels.title}
                  {item.estimateTotal !== null && (
                    <span className="font-semibold text-amber-800"> · {formatPeso(item.estimateTotal)}</span>
                  )}
                </p>
                <p className="mt-0.5 truncate text-xs text-gray-600">
                  {item.number} · {item.description ?? 'No description'}
                </p>
              </div>
              <Link
                href={item.href}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2"
              >
                {labels.button}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </li>
          )
        })}
      </ul>

      {items.length > SHOWN && (
        <div className="border-t border-amber-200/70 px-4 py-3 sm:px-5">
          <Link href={allHref} className="text-sm font-medium text-amber-800 hover:underline">
            View all {items.length} reports waiting for you
          </Link>
        </div>
      )}
    </section>
  )
}
