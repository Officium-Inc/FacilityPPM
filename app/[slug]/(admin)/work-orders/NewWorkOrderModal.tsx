'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import Modal from '@/components/ui/Modal'

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
  /** Service Group members whose role can do the work (the only ones who can be assigned, D33). */
  engineers: Engineer[]
}

const INPUT = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500'
const LABEL = 'block text-sm font-medium text-gray-700 mb-1'

export default function NewWorkOrderModal({ slug, schedules, engineers }: Props) {
  const router = useRouter()
  const formId = useId()
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

    const res = await fetch(`/api/properties/${encodeURIComponent(slug)}/work-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        schedule_id: form.schedule_id || undefined,
        engineer_id: form.engineer_id || undefined,
      }),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error ?? 'Failed to create work order.')
      setLoading(false)
      return
    }

    setOpen(false)
    setLoading(false)
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

      <Modal
        open={open}
        onClose={close}
        dismissible={!loading}
        size="lg"
        title="New Work Order"
        description="Fill in the details below to create a work order."
        footer={
          <>
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
              form={formId}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-green-700 hover:bg-green-800 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating…' : 'Create Work Order'}
            </button>
          </>
        }
      >
        <form id={formId} onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={LABEL}>WO Number *</label>
              <input type="text" required value={form.wo_number} onChange={(e) => set('wo_number', e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Type</label>
              <select value={form.type} onChange={(e) => set('type', e.target.value)} className={INPUT}>
                <option value="ppm">PPM</option>
                <option value="reactive">Reactive</option>
                <option value="inspection">Inspection</option>
              </select>
            </div>
            <div>
              <label className={LABEL}>Priority</label>
              <select value={form.priority} onChange={(e) => set('priority', e.target.value)} className={INPUT}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL}>PPM Schedule (optional)</label>
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
              <label className={LABEL}>Scheduled Date *</label>
              <input type="date" required value={form.scheduled_date} onChange={(e) => set('scheduled_date', e.target.value)} className={INPUT} />
            </div>
          </div>

          <div>
            <label className={LABEL}>Assigned to (Service Group, optional)</label>
            <select value={form.engineer_id} onChange={(e) => set('engineer_id', e.target.value)} className={INPUT}>
              <option value="">— Unassigned —</option>
              {engineers.map((eng) => (
                <option key={eng.id} value={eng.id}>{eng.full_name}</option>
              ))}
            </select>
            {engineers.length === 0 && (
              <p className="mt-1 text-xs text-gray-500">No Service Group members can do the work yet. Give someone a Service Group role in Settings.</p>
            )}
          </div>

          <div>
            <label className={LABEL}>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={4}
              placeholder="Additional notes or instructions..."
              className={`${INPUT} resize-none`}
            />
          </div>
        </form>
      </Modal>
    </>
  )
}
