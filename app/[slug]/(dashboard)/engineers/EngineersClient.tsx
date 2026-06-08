'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Pencil, Trash2 } from 'lucide-react'

const ROLE_OPTIONS = ['Admin', 'Engineer', 'Service Group', 'Tenant']

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

type ConfirmRemove = { id: string; name: string } | null

const EMPTY_FORM = { full_name: '', email: '', phone: '', role_name: '', certifications: '' }

export default function EngineersClient({ slug: _slug, engineers, roles }: Props) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editForm, setEditForm] = useState<{ role_name: string; phone: string; certifications: string; is_active: boolean }>({ role_name: '', phone: '', certifications: '', is_active: true })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<ConfirmRemove>(null)
  const [removeLoading, setRemoveLoading] = useState(false)

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function openEdit(eng: Engineer) {
    setEditId(eng.id)
    setEditForm({
      role_name: eng.roles?.name ?? '',
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
      body: JSON.stringify({ ...form, role_name: form.role_name || undefined }),
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

  async function handleRemove(id: string) {
    setRemoveLoading(true)
    const res = await fetch('/api/engineers', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setRemoveLoading(false)
    setConfirmRemove(null)
    if (res.ok) router.refresh()
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
          <h2 className="text-xl font-bold text-gray-900">Members</h2>
          <p className="text-sm text-gray-500 mt-0.5">{engineers.filter((e) => e.is_active).length} active</p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setError(null) }}
          className="inline-flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Member
        </button>
      </div>

      {/* Add Engineer Form */}
      {showAdd && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 text-sm">Add New Member</h3>
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
              <input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
              <select value={form.role_name} onChange={(e) => set('role_name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="">— No role —</option>
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Certifications</label>
              <input value={form.certifications} onChange={(e) => set('certifications', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="e.g. HVAC Cert, First Aid" />
            </div>
            <div className="col-span-2 flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setShowAdd(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-green-700 hover:bg-green-800 rounded-lg transition-colors disabled:opacity-50">
                {loading ? 'Adding…' : 'Add Member'}
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
                {['Name', 'Email', 'Phone', 'Role', 'Certifications', 'Status', '', ''].map((h, i) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {engineers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-gray-400">No members found.</td>
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
                        <button onClick={() => openEdit(eng)} className="text-gray-400 hover:text-green-600 transition-colors" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </td>
                      <td className="px-5 py-3">
                        <button onClick={() => setConfirmRemove({ id: eng.id, name: eng.full_name })} className="text-gray-400 hover:text-red-600 transition-colors" title="Remove">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                    {editId === eng.id && (
                      <tr key={`edit-${eng.id}`} className="bg-green-50">
                        <td colSpan={8} className="px-5 py-4">
                          {error && (
                            <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>
                          )}
                          <form onSubmit={handleEdit} className="flex flex-wrap gap-3 items-end">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                              <select value={editForm.role_name}
                                onChange={(e) => setEditForm((f) => ({ ...f, role_name: e.target.value }))}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                                <option value="">— No role —</option>
                                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                              <input value={editForm.phone}
                                onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Certifications</label>
                              <input value={editForm.certifications}
                                onChange={(e) => setEditForm((f) => ({ ...f, certifications: e.target.value }))}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                              <select value={editForm.is_active ? 'active' : 'inactive'}
                                onChange={(e) => setEditForm((f) => ({ ...f, is_active: e.target.value === 'active' }))}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
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
                                className="px-3 py-2 text-sm text-white bg-green-700 hover:bg-green-800 rounded-lg transition-colors disabled:opacity-50">
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

      {/* Confirm Remove Modal */}
      {confirmRemove && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold text-gray-900 mb-2">Remove Member</h3>
            <p className="text-sm text-gray-600 mb-5">
              Are you sure you want to remove <strong>{confirmRemove.name}</strong> from this property? This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmRemove(null)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={() => handleRemove(confirmRemove.id)} disabled={removeLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50">
                {removeLoading ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
