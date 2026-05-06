'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface Schedule {
  id: string
  title: string
  assets: { id: string; name: string } | null
}

interface Engineer {
  id: string
  full_name: string
}

interface Props {
  slug: string
  schedules: Schedule[]
  engineers: Engineer[]
}

export default function NewWorkOrderForm({ slug, schedules, engineers }: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  // Auto-generate WO number
  const [form, setForm] = useState({
    wo_number: `WO-${Date.now().toString().slice(-6)}`,
    schedule_id: '',
    engineer_id: '',
    type: 'ppm' as string,
    priority: 'medium' as string,
    scheduled_date: today,
    notes: '',
  })

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/work-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        schedule_id: form.schedule_id || undefined,
        engineer_id: form.engineer_id || undefined,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Failed to create work order.')
      setLoading(false)
      return
    }

    router.push(`/${slug}/work-orders/${data.id}`)
    router.refresh()
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/${slug}/work-orders`}
          className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h2 className="text-xl font-bold text-gray-900">New Work Order</h2>
          <p className="text-sm text-gray-500 mt-0.5">Fill in the details below to create a work order.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">WO Number *</label>
            <input
              type="text"
              required
              value={form.wo_number}
              onChange={(e) => set('wo_number', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={form.type}
              onChange={(e) => set('type', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ppm">PPM</option>
              <option value="reactive">Reactive</option>
              <option value="inspection">Inspection</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">PPM Schedule (optional)</label>
          <select
            value={form.schedule_id}
            onChange={(e) => set('schedule_id', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— Select schedule —</option>
            {schedules.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}{s.assets ? ` (${s.assets.name})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Engineer (optional)</label>
          <select
            value={form.engineer_id}
            onChange={(e) => set('engineer_id', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— Unassigned —</option>
            {engineers.map((eng) => (
              <option key={eng.id} value={eng.id}>{eng.full_name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select
              value={form.priority}
              onChange={(e) => set('priority', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Date *</label>
            <input
              type="date"
              required
              value={form.scheduled_date}
              onChange={(e) => set('scheduled_date', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="Additional notes or instructions..."
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Link
            href={`/${slug}/work-orders`}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Create Work Order'}
          </button>
        </div>
      </form>
    </div>
  )
}
