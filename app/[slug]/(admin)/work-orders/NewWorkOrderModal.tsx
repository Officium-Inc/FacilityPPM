'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'

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

const INPUT = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500'

export default function NewWorkOrderModal({ slug, schedules, engineers }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  const EMPTY = {
    wo_number: `WO-${Date.now().toString().slice(-6)}`,
    schedule_id: '',
    engineer_id: '',
    type: 'ppm',
    priority: 'medium',
    scheduled_date: today,
    notes: '',
  }
  const [form, setForm] = useState(EMPTY)

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function openModal() {
    setForm({ ...EMPTY, wo_number: `WO-${Date.now().toString().slice(-6)}` })
    setError(null)
    setOpen(true)
  }

  function close() {
    if (loading) return
    setOpen(false)
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

    setOpen(false)
    router.push(`/${slug}/work-orders/${data.id}`)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={openModal}
        className="inline-flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        <Plus className="w-4 h-4" />
        New Work Order
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={close}
          />

          {/* Dialog */}
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">New Work Order</h2>
                <p className="text-sm text-gray-500 mt-0.5">Fill in the details below to create a work order.</p>
              </div>
              <button
                onClick={close}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
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
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select value={form.type} onChange={(e) => set('type', e.target.value)} className={INPUT}>
                    <option value="ppm">PPM</option>
                    <option value="reactive">Reactive</option>
                    <option value="inspection">Inspection</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PPM Schedule (optional)</label>
                <select value={form.schedule_id} onChange={(e) => set('schedule_id', e.target.value)} className={INPUT}>
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
                <select value={form.engineer_id} onChange={(e) => set('engineer_id', e.target.value)} className={INPUT}>
                  <option value="">— Unassigned —</option>
                  {engineers.map((eng) => (
                    <option key={eng.id} value={eng.id}>{eng.full_name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select value={form.priority} onChange={(e) => set('priority', e.target.value)} className={INPUT}>
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
                    className={INPUT}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  rows={3}
                  placeholder="Additional notes or instructions..."
                  className={`${INPUT} resize-none`}
                />
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={close}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-700 hover:bg-green-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? 'Creating…' : 'Create Work Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
