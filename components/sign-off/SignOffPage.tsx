'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { WorkOrder } from '@/types'
import SignaturePad from './SignaturePad'
import RejectPanel from './RejectPanel'
import ChecklistItemComponent from '@/components/work-orders/ChecklistItem'
import { CheckCircle, Shield, Star } from 'lucide-react'
import { format } from 'date-fns'

interface SignOffPageProps {
  workOrder: WorkOrder
  token: string
}

export default function SignOffPage({ workOrder, token }: SignOffPageProps) {
  const router = useRouter()
  const [signature, setSignature] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [name, setName] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  const [ratingComment, setRatingComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checklist = (workOrder.checklist_items ?? []).sort(
    (a, b) => a.sort_order - b.sort_order
  )
  const asset = workOrder.ppm_schedules?.assets
  const site = asset?.buildings?.sites

  async function handleApprove() {
    if (!signature) {
      setError('Please draw your signature before submitting.')
      return
    }
    if (!confirmed) {
      setError('Please tick the confirmation checkbox.')
      return
    }
    if (!name.trim()) {
      setError('Please enter your full name.')
      return
    }

    setLoading(true)
    setError(null)

    const res = await fetch(`/api/sign-off/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'approve',
        signatureData: signature,
        signedByName: name.trim(),
        confirmedAt: new Date().toISOString(),
        rating: rating ?? undefined,
        ratingComment: ratingComment.trim() || undefined,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Submission failed. Please try again.')
      setLoading(false)
      return
    }

    router.push(`/sign-off/${token}/success`)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-green-800 text-white py-5 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-base leading-tight">Marajo Property Management</p>
              <p className="text-green-200 text-xs">Maintenance Sign-Off</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Work order summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-bold text-gray-900 text-lg mb-4">
            Work Order {workOrder.wo_number}
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Detail label="Property" value={site?.name ?? 'â€”'} />
            <Detail label="Address" value={site ? `${site.address}, ${site.city}` : 'â€”'} />
            <Detail label="Asset" value={asset?.name ?? 'â€”'} />
            <Detail label="Location" value={asset?.location ?? 'â€”'} />
            <Detail label="Engineer" value={workOrder.engineers?.full_name ?? 'â€”'} />
            <Detail
              label="Scheduled Date"
              value={
                workOrder.scheduled_date
                  ? format(new Date(workOrder.scheduled_date), 'dd MMM yyyy')
                  : 'â€”'
              }
            />
          </dl>
        </div>

        {/* Checklist */}
        {checklist.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 text-sm mb-2">
              Completed Checklist ({checklist.length} items)
            </h3>
            {checklist.map((item) => (
              <ChecklistItemComponent
                key={item.id}
                description={item.description}
                result={item.result}
                remarks={item.remarks}
                photoUrls={item.photo_urls}
              />
            ))}
          </div>
        )}

        {/* Rating */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="font-semibold text-gray-900 text-sm">Rate the Service (optional)</h3>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(rating === star ? null : star)}
                className="p-1 transition-transform hover:scale-110"
                type="button"
              >
                <Star
                  className={`w-8 h-8 transition-colors ${
                    rating !== null && star <= rating
                      ? 'text-yellow-400 fill-yellow-400'
                      : 'text-gray-300'
                  }`}
                />
              </button>
            ))}
          </div>
          {rating !== null && (
            <textarea
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              placeholder="Leave a comment about the service (optional)â€¦"
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
          )}
        </div>

        {/* Sign-off form */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
          <h3 className="font-semibold text-gray-900 text-sm">Your Signature</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Full name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Signature <span className="text-red-500">*</span>
            </label>
            <SignaturePad onSignature={setSignature} />
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 w-4 h-4"
            />
            <span className="text-sm text-gray-700">
              I confirm that the maintenance services described above were completed to my
              satisfaction and I approve this work order.
            </span>
          </label>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            onClick={handleApprove}
            disabled={loading || !signature || !confirmed || !name.trim()}
            className="w-full bg-green-700 hover:bg-green-800 disabled:bg-green-300 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
          >
            <CheckCircle className="w-4 h-4" />
            {loading ? 'Submittingâ€¦' : 'Approve & Sign Off'}
          </button>
        </div>

        {/* Reject */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <RejectPanel token={token} checklist={checklist} />
        </div>

        <p className="text-xs text-gray-400 text-center">
          This sign-off is legally binding. Your IP address and device will be recorded for
          audit purposes. This link expires 48 hours after issue.
        </p>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</dt>
      <dd className="text-gray-800 mt-0.5">{value}</dd>
    </div>
  )
}

