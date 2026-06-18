'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { WorkOrderCosting } from '@/types'
import SignaturePad from '@/components/sign-off/SignaturePad'
import { CheckCircle, FileText, XCircle } from 'lucide-react'

interface Props {
  token: string
  woNumber: string
  propertyName: string
  costing: WorkOrderCosting | null
}

export default function CostingApprovalPage({ token, woNumber, propertyName, costing }: Props) {
  const router = useRouter()
  const [view, setView] = useState<'review' | 'approve' | 'reject'>('review')
  const [name, setName] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(action: 'approve' | 'reject') {
    if (!name.trim()) {
      setError('Your name is required.')
      return
    }
    if (action === 'reject' && !reason.trim()) {
      setError('Please provide a rejection reason.')
      return
    }

    setLoading(true)
    setError(null)

    const res = await fetch(`/api/costing-approval/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        tenantName: name.trim(),
        signatureData: signature ?? undefined,
        reason: reason.trim() || undefined,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Submission failed.')
      setLoading(false)
      return
    }

    router.push(`/costing-approval/${token}/success?action=${action}`)
  }

  const grandTotal = costing?.grand_total ?? 0

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-green-800 text-white py-5 px-6">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-base leading-tight">Tenant360</p>
            <p className="text-green-200 text-xs">Cost Estimate Approval — {propertyName}</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-bold text-gray-900 text-lg mb-1">Work Order {woNumber}</h2>
          <p className="text-sm text-gray-500 mb-4">{propertyName}</p>

          {costing ? (
            <div className="space-y-3">
              {/* Line items */}
              {costing.line_items?.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                      <th className="text-left pb-2">Item</th>
                      <th className="text-right pb-2">Qty</th>
                      <th className="text-right pb-2">Unit Cost</th>
                      <th className="text-right pb-2">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {costing.line_items.map((item, i) => (
                      <tr key={i} className="py-1">
                        <td className="py-1.5 text-gray-700">{item.description}</td>
                        <td className="py-1.5 text-right text-gray-500">{item.qty}</td>
                        <td className="py-1.5 text-right text-gray-500">
                          ₱{item.unit_cost.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-1.5 text-right text-gray-700">
                          ₱{(item.qty * item.unit_cost).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="border-t border-gray-200 pt-3 space-y-1 text-sm">
                {costing.labour_total > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Labour ({costing.labour_hours}h × ₱{costing.labour_rate}/h)</span>
                    <span>₱{costing.labour_total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {costing.subcontractor_total > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Subcontractor</span>
                    <span>₱{costing.subcontractor_total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-900 text-base pt-1 border-t border-gray-200">
                  <span>Total Estimate</span>
                  <span>₱{grandTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              {costing.notes && (
                <p className="text-sm text-gray-500 mt-2 italic">{costing.notes}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No cost estimate details available.</p>
          )}
        </div>

        {/* Name field (always visible) */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Your Full Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your full name"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>

        {/* Approve panel */}
        {(view === 'review' || view === 'approve') && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h3 className="font-semibold text-gray-900 text-sm">Approve Cost Estimate</h3>
            <p className="text-sm text-gray-600">
              By approving, you authorise Tenant360 to proceed with the work
              described above at the quoted cost.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Digital Signature (optional)
              </label>
              <SignaturePad onSignature={setSignature} />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              onClick={() => submit('approve')}
              disabled={loading || !name.trim()}
              className="w-full bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <CheckCircle className="w-4 h-4" />
              {loading ? 'Submitting…' : `Approve — ₱${grandTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
            </button>
          </div>
        )}

        {/* Reject panel */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <button
            type="button"
            onClick={() => setView(view === 'reject' ? 'review' : 'reject')}
            className="text-sm text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
          >
            <XCircle className="w-4 h-4" />
            {view === 'reject' ? 'Cancel Rejection' : 'Reject Cost Estimate'}
          </button>

          {view === 'reject' && (
            <div className="space-y-3">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Please explain why you are rejecting this estimate…"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              />
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
              <button
                onClick={() => submit('reject')}
                disabled={loading || !name.trim() || !reason.trim()}
                className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
              >
                {loading ? 'Submitting…' : 'Confirm Rejection'}
              </button>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 text-center">
          Your IP address will be recorded for audit purposes. This link expires 7 days after issue.
        </p>
      </div>
    </div>
  )
}
