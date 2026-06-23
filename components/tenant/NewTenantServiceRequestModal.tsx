'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const URGENCY_OPTIONS = [
  { value: 'critical', label: 'Critical - immediate safety risk' },
  { value: 'high', label: 'High - significant disruption' },
  { value: 'medium', label: 'Medium - normal priority' },
  { value: 'low', label: 'Low - cosmetic / minor' },
]

const INPUT = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500'

export default function NewTenantServiceRequestModal({
  slug,
  defaultContact,
  triggerLabel = 'New Service Request',
  variant = 'primary',
}: {
  slug: string
  defaultContact?: string
  triggerLabel?: string
  variant?: 'primary' | 'link'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    faultDescription: '',
    locationNotes: '',
    reportedByContact: defaultContact ?? '',
    urgency: 'medium',
  })

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm((value) => ({ ...value, [key]: e.target.value }))
    }
  }

  function openModal() {
    setError(null)
    setForm({
      faultDescription: '',
      locationNotes: '',
      reportedByContact: defaultContact ?? '',
      urgency: 'medium',
    })
    setOpen(true)
  }

  function close() {
    if (!loading) setOpen(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.faultDescription.trim()) {
      setError('Please describe the service request.')
      return
    }

    setLoading(true)
    setError(null)

    const res = await fetch('/api/service-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, priority: form.urgency, slug }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Failed to submit service request.')
      setLoading(false)
      return
    }

    setOpen(false)
    router.push(`/${slug}/tenant/service-requests/${data.workOrderId}`)
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={cn(
          'inline-flex items-center gap-2 text-sm font-medium transition-colors',
          variant === 'primary'
            ? 'rounded-lg bg-green-700 px-4 py-2 text-white hover:bg-green-800'
            : 'text-green-700 hover:underline'
        )}
      >
        <Plus className="h-4 w-4" />
        {triggerLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />

          <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">New Service Request</h2>
                <p className="mt-0.5 text-sm text-gray-500">
                  Submit a maintenance request to the property team.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close service request form"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <Field label="Description" required>
                <textarea
                  value={form.faultDescription}
                  onChange={set('faultDescription')}
                  placeholder="Describe the issue, where it is, and how urgent it feels."
                  rows={4}
                  required
                  className={`${INPUT} resize-none`}
                />
              </Field>

              <Field label="Location / Unit" hint="Tower, floor, unit, or area">
                <input
                  type="text"
                  value={form.locationNotes}
                  onChange={set('locationNotes')}
                  placeholder="e.g. Tower A, Floor 12, Unit 1205"
                  className={INPUT}
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Contact Number / Email">
                  <input
                    type="text"
                    value={form.reportedByContact}
                    onChange={set('reportedByContact')}
                    placeholder="Phone or email"
                    className={INPUT}
                  />
                </Field>
                <Field label="Urgency">
                  <select value={form.urgency} onChange={set('urgency')} className={INPUT}>
                    {URGENCY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={close}
                  disabled={loading}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-800 disabled:opacity-50"
                >
                  {loading ? 'Submitting...' : 'Submit Service Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
        {hint && <span className="ml-1 font-normal text-gray-400">({hint})</span>}
      </label>
      {children}
    </div>
  )
}
