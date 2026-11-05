import type { ReactNode } from 'react'
import { formatPeso } from '@/lib/costing'

export interface DetailRow {
  label: string
  value: string | null | undefined
  /** Smaller second line, e.g. a phone number under the contact's name. */
  hint?: string | null
}

export interface DetailsCost {
  /** Latest estimate total; null when no estimate was prepared. */
  total: number | null
  isWaived: boolean
  waivedBy: string | null
  /** "Approved" / "Awaiting tenant approval" */
  note: string | null
}

/** Right-hand summary of the work order: where, who, when and what it costs. Empty rows are left out. */
export default function WorkOrderDetailsCard({ rows, cost, children }: { rows: DetailRow[]; cost: DetailsCost; children?: ReactNode }) {
  const visible = rows.filter((row) => row.value?.trim())

  return (
    <section aria-labelledby="work-order-details-title" className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 id="work-order-details-title" className="text-sm font-semibold text-gray-900">Details</h2>

      {visible.length > 0 && (
        <dl className="mt-4 space-y-3 text-sm">
          {visible.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-4">
              <dt className="shrink-0 text-gray-500">{row.label}</dt>
              <dd className="min-w-0 break-words text-right text-gray-900">
                {row.value}
                {row.hint && <span className="block text-xs text-gray-500">{row.hint}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-4 border-t border-gray-200 pt-4">
        <p className="text-sm text-gray-500">Cost</p>
        {cost.isWaived ? (
          <>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
              {cost.total !== null && (
                <s className="text-base text-gray-500">
                  <span className="sr-only">Estimated </span>
                  {formatPeso(cost.total)}
                </s>
              )}
              <span className="text-lg font-semibold text-gray-900">{formatPeso(0)}</span>
            </p>
            <p className="mt-0.5 text-xs text-purple-700">{cost.waivedBy ? `Waived by ${cost.waivedBy}` : 'Cost waived'}</p>
          </>
        ) : cost.total !== null ? (
          <>
            <p className="mt-1 text-lg font-semibold text-gray-900">{formatPeso(cost.total)}</p>
            {cost.note && <p className="mt-0.5 text-xs text-gray-500">{cost.note}</p>}
          </>
        ) : (
          <p className="mt-1 text-sm text-gray-900">Not estimated yet</p>
        )}
      </div>

      {children && <div className="mt-4">{children}</div>}
    </section>
  )
}
