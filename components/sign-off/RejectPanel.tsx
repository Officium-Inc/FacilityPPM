'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ChecklistItem } from '@/types'
import { XCircle } from 'lucide-react'

interface RejectPanelProps {
  token: string
  checklist: ChecklistItem[]
}

export default function RejectPanel({ token, checklist }: RejectPanelProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [flagged, setFlagged] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleFlag(id: string) {
    setFlagged((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    )
  }

  async function handleReject() {
    if (!reason.trim()) {
      setError('Please provide a rejection reason.')
      return
    }
    setLoading(true)
    setError(null)

    const res = await fetch(`/api/sign-off/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reject',
        rejectionReason: reason.trim(),
        flaggedItems: flagged,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Failed to submit rejection.')
      setLoading(false)
      return
    }

    router.push(`/sign-off/${token}/rejected`)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-red-600 hover:underline flex items-center gap-1.5"
      >
        <XCircle className="w-4 h-4" />
        Raise a concern / reject
      </button>
    )
  }

  return (
    <div className="border border-red-200 rounded-xl bg-red-50 p-5 space-y-4">
      <h3 className="font-semibold text-red-800 text-sm">Raise a Concern</h3>

      {checklist.length > 0 && (
        <div>
          <p className="text-sm text-red-700 mb-2">Flag specific items (optional):</p>
          <div className="space-y-1.5">
            {checklist.map((item) => (
              <label key={item.id} className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={flagged.includes(item.id)}
                  onChange={() => toggleFlag(item.id)}
                  className="mt-0.5"
                />
                <span className="text-sm text-gray-700">{item.description}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-red-700 mb-1">
          Reason for rejection <span className="text-red-500">*</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
          placeholder="Describe the issue…"
        />
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-100 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleReject}
          disabled={loading}
          className="bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {loading ? 'Submitting…' : 'Submit Rejection'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="text-sm text-gray-600 hover:text-gray-800 px-4 py-2 rounded-lg border border-gray-300 bg-white"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
