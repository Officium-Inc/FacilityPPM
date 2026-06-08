'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'

const URGENCY_OPTIONS = [
  { value: 'critical', label: 'Critical — immediate safety risk' },
  { value: 'high',     label: 'High — significant disruption' },
  { value: 'medium',   label: 'Medium — normal priority' },
  { value: 'low',      label: 'Low — cosmetic / minor' },
]

export default function FaultReportForm({ slug }: { slug: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    faultDescription: '',
    locationNotes: '',
    reportedByName: '',
    reportedByContact: '',
    urgency: 'medium',
    type: 'reactive',
  })

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.faultDescription.trim() || !form.reportedByName.trim()) {
      setError('Fault description and reported-by name are required.')
      return
    }

    setLoading(true)
    setError(null)

    const res = await fetch('/api/fault-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, priority: form.urgency }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Failed to submit fault report.')
      setLoading(false)
      return
    }

    router.push(`/${slug}/work-orders/${data.workOrderId}`)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <Field label="Fault Description" required>
        <textarea
          value={form.faultDescription}
          onChange={set('faultDescription')}
          placeholder="Describe what is broken, where it is, and how severe the problem is…"
          rows={4}
          required
          className={INPUT}
        />
      </Field>

      <Field label="Location / Unit" hint="Site, building, floor, or unit number">
        <input
          type="text"
          value={form.locationNotes}
          onChange={set('locationNotes')}
          placeholder="e.g. Tower A, Floor 12, Unit 1205"
          className={INPUT}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Reported By" required>
          <input
            type="text"
            value={form.reportedByName}
            onChange={set('reportedByName')}
            placeholder="Full name"
            required
            className={INPUT}
          />
        </Field>
        <Field label="Contact Number / Email">
          <input
            type="text"
            value={form.reportedByContact}
            onChange={set('reportedByContact')}
            placeholder="Phone or email"
            className={INPUT}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Urgency">
          <select value={form.urgency} onChange={set('urgency')} className={INPUT}>
            {URGENCY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Type">
          <select value={form.type} onChange={set('type')} className={INPUT}>
            <option value="reactive">Reactive</option>
            <option value="ppm">PPM</option>
            <option value="statutory">Statutory</option>
            <option value="project">Project</option>
          </select>
        </Field>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-white bg-green-700 hover:bg-green-800 disabled:opacity-50 rounded-lg transition-colors"
        >
          {loading ? 'Submitting…' : 'Submit Fault Report'}
        </button>
      </div>
    </form>
  )
}

const INPUT = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500'

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
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
        {hint && <span className="font-normal text-gray-400 ml-1">({hint})</span>}
      </label>
      {children}
    </div>
  )
}
