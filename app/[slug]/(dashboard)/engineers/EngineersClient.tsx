'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Pencil } from 'lucide-react'

interface Role { id: string; name: string }
interface Engineer {
  id: string
  full_name: string
  email: string
  phone?: string | null
  certifications?: string | null
  is_active: boolean
  roles?: { id: string; name: string } | null
}

interface Props {
  slug: string
  engineers: Engineer[]
  roles: Role[]
}

const EMPTY_FORM = { full_name: '', email: '', phone: '', role_id: '', certifications: '' }

export default function EngineersClient({ slug: _slug, engineers, roles }: Props) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editForm, setEditForm] = useState<{ role_id: string; phone: string; certifications: string; is_active: boolean }>({ role_id: '', phone: '', certifications: '', is_active: true })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function openEdit(eng: Engineer) {
    setEditId(eng.id)
    setEditForm({
      role_id: eng.roles?.id ?? '',
      phone: eng.phone ?? '',
      certifications: eng.certifications ?? '',
      is_active: eng.is_active,
    })
    setError(null)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/engineers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Failed to add engineer.')
      setLoading(false)
      return
    }

    setForm(EMPTY_FORM)
    setShowAdd(false)
    router.refresh()
    setLoading(false)
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editId) return
    setLoading(true)
    setError(null)

    const res = await fetch('/api/engineers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editId, ...editForm }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Failed to update engineer.')
      setLoading(false)
      return
    }

    setEditId(null)
    router.refresh()
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Engineers</h2>
          <p className="text-sm text-gray-500 mt-0.5">{engineers.filter((e) => e.is_active).length} active</p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setError(null) }}
          className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Engineer
        </button>
      </div>

      {/* Add Engineer Form */}
      {showAdd && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 text-sm">Add New Engineer</h3>
            <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>
          )}
          <form onSubmit={handleAdd} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Full Name *</label>
              <input required value={form.full_name} onChange={(e) => set('full_name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
              <input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
              <select value={form.role_id} onChange={(e) => set('role_id', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— No role —</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Certifications</label>
              <input value={form.certifications} onChange={(e) => set('certifications', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. HVAC Cert, First Aid" />
            </div>
            <div className="col-span-2 flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setShowAdd(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors disabled:opacity-50">
                {loading ? 'Adding…' : 'Add Engineer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Engineers Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Name', 'Email', 'Phone', 'Role', 'Certifications', 'Status', ''].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {engineers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-gray-400">No engineers found.</td>
                </tr>
              ) : (
                engineers.map((eng) => (
                  <>
                    <tr key={eng.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{eng.full_name}</td>
                      <td className="px-5 py-3 text-gray-600">{eng.email}</td>
                      <td className="px-5 py-3 text-gray-600">{eng.phone ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-600 capitalize">{eng.roles?.name ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-600">{eng.certifications ?? '—'}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${eng.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {eng.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <button onClick={() => openEdit(eng)} className="text-gray-400 hover:text-blue-600 transition-colors" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                    {editId === eng.id && (
                      <tr key={`edit-${eng.id}`} className="bg-blue-50">
                        <td colSpan={7} className="px-5 py-4">
                          {error && (
                            <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>
                          )}
                          <form onSubmit={handleEdit} className="flex flex-wrap gap-3 items-end">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                              <select value={editForm.role_id}
                                onChange={(e) => setEditForm((f) => ({ ...f, role_id: e.target.value }))}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="">— No role —</option>
                                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                              <input value={editForm.phone}
                                onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Certifications</label>
                              <input value={editForm.certifications}
                                onChange={(e) => setEditForm((f) => ({ ...f, certifications: e.target.value }))}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                              <select value={editForm.is_active ? 'active' : 'inactive'}
                                onChange={(e) => setEditForm((f) => ({ ...f, is_active: e.target.value === 'active' }))}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                              </select>
                            </div>
                            <div className="flex gap-2 ml-auto">
                              <button type="button" onClick={() => setEditId(null)}
                                className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-white transition-colors">
                                Cancel
                              </button>
                              <button type="submit" disabled={loading}
                                className="px-3 py-2 text-sm text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors disabled:opacity-50">
                                {loading ? 'Saving…' : 'Save'}
                              </button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
