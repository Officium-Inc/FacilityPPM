'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'

interface Building { id: string; name: string; site_name: string }
interface Asset {
  id: string
  name: string
  category?: string | null
  make?: string | null
  model?: string | null
  location?: string | null
  status?: string | null
  buildings?: { name: string; sites?: { name: string } | null } | null
}

interface Props {
  slug: string
  assets: Asset[]
  buildings: Building[]
}

const EMPTY = { building_id: '', name: '', category: '', make: '', model: '', serial_no: '', location: '' }

export default function AssetsClient({ slug: _slug, assets, buildings }: Props) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Failed to add asset.')
      setLoading(false)
      return
    }

    setForm(EMPTY)
    setShowAdd(false)
    router.refresh()
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Asset Registry</h2>
          <p className="text-sm text-gray-500 mt-0.5">{assets.length} assets</p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setError(null) }}
          className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Asset
        </button>
      </div>

      {/* Add Asset Form */}
      {showAdd && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 text-sm">Add New Asset</h3>
            <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>
          )}
          {buildings.length === 0 ? (
            <p className="text-sm text-gray-500">No buildings found for this property. Please add a building first.</p>
          ) : (
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Building *</label>
                <select required value={form.building_id} onChange={(e) => set('building_id', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Select building —</option>
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} ({b.site_name})</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Asset Name *</label>
                <input required value={form.name} onChange={(e) => set('name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. AHU-01 Level 3" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                <input value={form.category} onChange={(e) => set('category', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. HVAC, Electrical" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Location</label>
                <input value={form.location} onChange={(e) => set('location', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Level 3 Ceiling Void" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Make</label>
                <input value={form.make} onChange={(e) => set('make', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Model</label>
                <input value={form.model} onChange={(e) => set('model', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Serial Number</label>
                <input value={form.serial_no} onChange={(e) => set('serial_no', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="col-span-2 flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setShowAdd(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors disabled:opacity-50">
                  {loading ? 'Adding…' : 'Add Asset'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Assets Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Name', 'Category', 'Building', 'Site', 'Make / Model', 'Location', 'Status'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-gray-400">No assets found.</td>
                </tr>
              ) : (
                assets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{asset.name}</td>
                    <td className="px-5 py-3 text-gray-600">{asset.category ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{asset.buildings?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{asset.buildings?.sites?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{[asset.make, asset.model].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{asset.location ?? '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                        asset.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {asset.status ?? 'active'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
