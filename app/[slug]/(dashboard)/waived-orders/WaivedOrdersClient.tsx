'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Ban, RotateCcw } from 'lucide-react'
import StatusBadge from '@/components/work-orders/StatusBadge'
import { formatPHT } from '@/lib/utils'
import type { WorkOrderStatus } from '@/types'

interface WoRow {
  id: string
  wo_number: string
  status: WorkOrderStatus
  priority: string
  type: string
  created_at: string
  is_cost_waived: boolean | null
  cost_waived_at: string | null
  cost_waived_by_name: string | null
  cost_waived_reason: string | null
  engineers: { full_name: string } | null
}

interface Props {
  workOrders: WoRow[]
  slug: string
}

export default function WaivedOrdersClient({ workOrders, slug }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [waivedMap, setWaivedMap] = useState<Record<string, { waived: boolean; reason?: string; by?: string; at?: string }>>(() =>
    Object.fromEntries(
      workOrders.map((wo) => [
        wo.id,
        {
          waived: wo.is_cost_waived ?? false,
          reason: wo.cost_waived_reason ?? undefined,
          by: wo.cost_waived_by_name ?? undefined,
          at: wo.cost_waived_at ?? undefined,
        },
      ])
    )
  )
  const [reasonMap, setReasonMap] = useState<Record<string, string>>({})
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  async function waive(woId: string) {
    setLoading(woId)
    const res = await fetch(`/api/work-orders/${woId}/waive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reasonMap[woId] ?? '' }),
    })
    if (res.ok) {
      setWaivedMap((prev) => ({ ...prev, [woId]: { waived: true, reason: reasonMap[woId], at: new Date().toISOString() } }))
      setConfirmingId(null)
      router.refresh()
    }
    setLoading(null)
  }

  async function unwaive(woId: string) {
    setLoading(woId)
    const res = await fetch(`/api/work-orders/${woId}/waive`, { method: 'DELETE' })
    if (res.ok) {
      setWaivedMap((prev) => ({ ...prev, [woId]: { waived: false } }))
      router.refresh()
    }
    setLoading(null)
  }

  if (workOrders.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <Ban className="w-8 h-8 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">No work orders found for this property.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {['WO #', 'Type', 'Priority', 'Assigned To', 'Status', 'Cost Waived', 'Created', 'Action'].map((h) => (
                <th key={h} className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {workOrders.map((wo) => {
              const state = waivedMap[wo.id]
              const isWaived = state?.waived
              const isLoading = loading === wo.id
              const isConfirming = confirmingId === wo.id

              return (
                <tr key={wo.id} className={`hover:bg-gray-50 transition-colors ${isWaived ? 'bg-purple-50/40' : ''}`}>
                  <td className="px-5 py-3">
                    <Link href={`/${slug}/work-orders/${wo.id}`} className="font-medium text-green-700 hover:underline">
                      {wo.wo_number}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-gray-600 capitalize">{wo.type}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                      wo.priority === 'critical' ? 'bg-red-100 text-red-700' :
                      wo.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                      wo.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {wo.priority}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{wo.engineers?.full_name ?? '—'}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={wo.status as WorkOrderStatus} />
                  </td>
                  <td className="px-5 py-3">
                    {isWaived ? (
                      <div>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                          <Ban className="w-3 h-3" /> Waived
                        </span>
                        {state.at && <p className="text-xs text-gray-400 mt-0.5">{formatPHT(state.at)}</p>}
                        {state.reason && <p className="text-xs text-gray-500 italic">&ldquo;{state.reason}&rdquo;</p>}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-500">{formatPHT(wo.created_at)}</td>
                  <td className="px-5 py-3">
                    {isWaived ? (
                      <button
                        onClick={() => unwaive(wo.id)}
                        disabled={isLoading}
                        className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
                      >
                        <RotateCcw className="w-3 h-3" />
                        {isLoading ? 'Removing...' : 'Remove Waiver'}
                      </button>
                    ) : isConfirming ? (
                      <div className="space-y-1.5 min-w-[200px]">
                        <input
                          type="text"
                          placeholder="Reason (optional)"
                          value={reasonMap[wo.id] ?? ''}
                          onChange={(e) => setReasonMap((prev) => ({ ...prev, [wo.id]: e.target.value }))}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded-lg"
                        />
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => waive(wo.id)}
                            disabled={isLoading}
                            className="flex-1 bg-purple-700 hover:bg-purple-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                          >
                            {isLoading ? 'Waiving...' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setConfirmingId(null)}
                            className="flex-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg px-2.5 py-1.5"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmingId(wo.id)}
                        className="inline-flex items-center gap-1 text-xs text-purple-700 hover:text-purple-900 border border-purple-300 rounded-lg px-2.5 py-1.5 transition-colors"
                      >
                        <Ban className="w-3 h-3" /> Waive Cost
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
