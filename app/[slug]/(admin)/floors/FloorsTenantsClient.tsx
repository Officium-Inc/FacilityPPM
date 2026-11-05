'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Building2, Layers, Link2, Pencil, Plus, Trash2, UserPlus, Users, X } from 'lucide-react'
import type { CompanyWithFloors, FloorWithTenant } from '@/lib/floors'

export interface TenantMember {
  id: string
  full_name: string
  email: string
  is_active: boolean
  company_id: string | null
}

interface Props {
  slug: string
  floors: FloorWithTenant[]
  companies: CompanyWithFloors[]
  tenantMembers: TenantMember[]
  canManageFloors: boolean
  canManageCompanies: boolean
  canInviteMembers: boolean
}

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500'
const BUTTON = 'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50'
const PRIMARY = `${BUTTON} bg-green-700 text-white hover:bg-green-800`
const SECONDARY = `${BUTTON} border border-gray-300 text-gray-700 hover:bg-gray-50`
const ICON_BUTTON = 'rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40'

const EMPTY_COMPANY = { name: '', contactName: '', contactEmail: '', contactPhone: '' }

export default function FloorsTenantsClient({
  slug,
  floors,
  companies,
  tenantMembers,
  canManageFloors,
  canManageCompanies,
  canInviteMembers,
}: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [newFloor, setNewFloor] = useState({ label: '', level: '' })
  const [editingFloor, setEditingFloor] = useState<{ id: string; label: string; level: string } | null>(null)
  const [assignChoice, setAssignChoice] = useState<Record<string, string>>({})

  const [showCompanyForm, setShowCompanyForm] = useState(false)
  const [companyForm, setCompanyForm] = useState(EMPTY_COMPANY)
  const [editingCompany, setEditingCompany] = useState<{ id: string } & typeof EMPTY_COMPANY | null>(null)
  const [linkChoice, setLinkChoice] = useState<Record<string, string>>({})

  const base = `/api/properties/${encodeURIComponent(slug)}`
  const activeCompanies = companies.filter((company) => company.is_active)
  const companyName = (id: string | null) => companies.find((company) => company.id === id)?.name ?? null
  const unlinked = tenantMembers.filter((member) => !member.company_id)
  const linked = tenantMembers.filter((member) => member.company_id)

  async function call(key: string, path: string, method: string, body?: unknown, success?: string) {
    setBusy(key)
    setMessage(null)
    const res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) {
      setMessage({ type: 'error', text: data.error ?? 'Something went wrong.' })
      return false
    }
    if (success) setMessage({ type: 'success', text: success })
    router.refresh()
    return true
  }

  function moveFloor(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= floors.length) return
    const order = floors.map((floor) => floor.id)
    ;[order[index], order[target]] = [order[target], order[index]]
    void call(`move-${floors[index].id}`, `${base}/floors`, 'PATCH', { order })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold text-gray-900">Floors &amp; Tenants</h2>
        <p className="text-sm text-gray-500">
          {canManageFloors
            ? 'Add or remove floors, set the tenant company for each floor and manage tenant companies.'
            : 'Floors of this property and the companies that occupy them.'}
        </p>
      </div>

      {message && (
        <div className={`rounded-lg border px-4 py-2 text-sm ${message.type === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {/* Floors */}
      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
          <Layers className="h-4 w-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">Floors</h3>
          <span className="text-xs text-gray-400">{floors.length}</span>
        </div>

        {canManageFloors && (
          <form
            className="flex flex-wrap items-end gap-3 border-b border-gray-100 px-5 py-4"
            onSubmit={async (e) => {
              e.preventDefault()
              const ok = await call('add-floor', `${base}/floors`, 'POST', { label: newFloor.label, level: newFloor.level }, 'Floor added.')
              if (ok) setNewFloor({ label: '', level: '' })
            }}
          >
            <div className="min-w-[12rem] flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-700">Floor name</label>
              <input className={INPUT} value={newFloor.label} onChange={(e) => setNewFloor((f) => ({ ...f, label: e.target.value }))} placeholder="e.g. 12th Floor" required maxLength={60} />
            </div>
            <div className="w-28">
              <label className="mb-1 block text-xs font-medium text-gray-700">Level</label>
              <input className={INPUT} type="number" value={newFloor.level} onChange={(e) => setNewFloor((f) => ({ ...f, level: e.target.value }))} placeholder="12" />
            </div>
            <button type="submit" className={PRIMARY} disabled={busy === 'add-floor'}>
              <Plus className="h-4 w-4" /> Add floor
            </button>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Floor</th>
                <th className="px-5 py-3">Level</th>
                <th className="px-5 py-3">Tenant</th>
                {canManageFloors && <th className="px-5 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {floors.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-10 text-center text-gray-400">No floors yet.</td></tr>
              ) : floors.map((floor, index) => {
                const editing = editingFloor?.id === floor.id
                return (
                  <tr key={floor.id} className="align-middle">
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {editing ? (
                        <input className={INPUT} value={editingFloor.label} maxLength={60} onChange={(e) => setEditingFloor({ ...editingFloor, label: e.target.value })} />
                      ) : floor.label}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {editing ? (
                        <input className={`${INPUT} w-24`} type="number" value={editingFloor.level} onChange={(e) => setEditingFloor({ ...editingFloor, level: e.target.value })} />
                      ) : floor.level ?? '—'}
                    </td>
                    <td className="px-5 py-3">
                      {floor.company ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                          <Building2 className="h-3 w-3" /> {floor.company.name}
                        </span>
                      ) : canManageFloors && activeCompanies.length > 0 ? (
                        <div className="flex items-center gap-2">
                          <select
                            className={`${INPUT} max-w-[14rem]`}
                            value={assignChoice[floor.id] ?? ''}
                            onChange={(e) => setAssignChoice((c) => ({ ...c, [floor.id]: e.target.value }))}
                          >
                            <option value="">Select company…</option>
                            {activeCompanies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                          </select>
                          <button
                            type="button"
                            className={SECONDARY}
                            disabled={!assignChoice[floor.id] || busy === `assign-${floor.id}`}
                            onClick={() => call(`assign-${floor.id}`, `${base}/floors/${floor.id}/occupancy`, 'POST', { companyId: assignChoice[floor.id] }, 'Tenant set for the floor.')}
                          >
                            Set tenant
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Vacant</span>
                      )}
                    </td>
                    {canManageFloors && (
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {editing ? (
                            <>
                              <button
                                type="button"
                                className={SECONDARY}
                                disabled={busy === `edit-${floor.id}`}
                                onClick={async () => {
                                  const ok = await call(`edit-${floor.id}`, `${base}/floors/${floor.id}`, 'PATCH', { label: editingFloor.label, level: editingFloor.level }, 'Floor updated.')
                                  if (ok) setEditingFloor(null)
                                }}
                              >
                                Save
                              </button>
                              <button type="button" className={ICON_BUTTON} title="Cancel" onClick={() => setEditingFloor(null)}><X className="h-4 w-4" /></button>
                            </>
                          ) : (
                            <>
                              {floor.company && (
                                <button
                                  type="button"
                                  className={`${SECONDARY} text-xs`}
                                  disabled={busy === `vacate-${floor.id}`}
                                  onClick={() => {
                                    if (!confirm(`Remove ${floor.company?.name} from ${floor.label}?`)) return
                                    void call(`vacate-${floor.id}`, `${base}/floors/${floor.id}/occupancy`, 'DELETE', undefined, 'Tenant removed from the floor.')
                                  }}
                                >
                                  Remove tenant
                                </button>
                              )}
                              <button type="button" className={ICON_BUTTON} title="Move up" disabled={index === 0 || busy !== null} onClick={() => moveFloor(index, -1)}>
                                <ArrowUp className="h-4 w-4" />
                              </button>
                              <button type="button" className={ICON_BUTTON} title="Move down" disabled={index === floors.length - 1 || busy !== null} onClick={() => moveFloor(index, 1)}>
                                <ArrowDown className="h-4 w-4" />
                              </button>
                              <button type="button" className={ICON_BUTTON} title="Rename" onClick={() => setEditingFloor({ id: floor.id, label: floor.label, level: floor.level?.toString() ?? '' })}>
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                className={`${ICON_BUTTON} hover:text-red-600`}
                                title={floor.company ? 'Remove the tenant first' : 'Delete floor'}
                                disabled={Boolean(floor.company) || busy === `delete-${floor.id}`}
                                onClick={() => {
                                  if (!confirm(`Delete ${floor.label}?`)) return
                                  void call(`delete-${floor.id}`, `${base}/floors/${floor.id}`, 'DELETE', undefined, 'Floor deleted.')
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Companies */}
      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-900">Tenant companies</h3>
            <span className="text-xs text-gray-400">{companies.length}</span>
          </div>
          <div className="flex items-center gap-2">
            {canInviteMembers && (
              <Link href={`/${slug}/settings?tab=members`} className={SECONDARY}>
                <UserPlus className="h-4 w-4" /> Invite tenant user
              </Link>
            )}
            {canManageCompanies && !showCompanyForm && (
              <button type="button" className={PRIMARY} onClick={() => setShowCompanyForm(true)}>
                <Plus className="h-4 w-4" /> Add company
              </button>
            )}
          </div>
        </div>

        {canManageCompanies && showCompanyForm && (
          <form
            className="grid grid-cols-1 gap-3 border-b border-gray-100 px-5 py-4 sm:grid-cols-2 lg:grid-cols-5"
            onSubmit={async (e) => {
              e.preventDefault()
              const ok = await call('add-company', `${base}/companies`, 'POST', companyForm, 'Company added.')
              if (ok) { setCompanyForm(EMPTY_COMPANY); setShowCompanyForm(false) }
            }}
          >
            <input className={INPUT} placeholder="Company name *" required maxLength={120} value={companyForm.name} onChange={(e) => setCompanyForm((f) => ({ ...f, name: e.target.value }))} />
            <input className={INPUT} placeholder="Contact person" value={companyForm.contactName} onChange={(e) => setCompanyForm((f) => ({ ...f, contactName: e.target.value }))} />
            <input className={INPUT} placeholder="Contact email" type="email" value={companyForm.contactEmail} onChange={(e) => setCompanyForm((f) => ({ ...f, contactEmail: e.target.value }))} />
            <input className={INPUT} placeholder="Contact phone" value={companyForm.contactPhone} onChange={(e) => setCompanyForm((f) => ({ ...f, contactPhone: e.target.value }))} />
            <div className="flex gap-2">
              <button type="submit" className={PRIMARY} disabled={busy === 'add-company'}>Save</button>
              <button type="button" className={SECONDARY} onClick={() => { setShowCompanyForm(false); setCompanyForm(EMPTY_COMPANY) }}>Cancel</button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Company</th>
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3">Floors</th>
                <th className="px-5 py-3">Users</th>
                <th className="px-5 py-3">Status</th>
                {canManageCompanies && <th className="px-5 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {companies.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400">No tenant companies yet.</td></tr>
              ) : companies.map((company) => {
                const users = linked.filter((member) => member.company_id === company.id)
                const editing = editingCompany?.id === company.id
                return (
                  <tr key={company.id} className={company.is_active ? '' : 'bg-gray-50/60 text-gray-400'}>
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {editing ? (
                        <input className={INPUT} value={editingCompany.name} maxLength={120} onChange={(e) => setEditingCompany({ ...editingCompany, name: e.target.value })} />
                      ) : company.name}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {editing ? (
                        <div className="grid gap-1.5">
                          <input className={INPUT} placeholder="Contact person" value={editingCompany.contactName} onChange={(e) => setEditingCompany({ ...editingCompany, contactName: e.target.value })} />
                          <input className={INPUT} placeholder="Contact email" value={editingCompany.contactEmail} onChange={(e) => setEditingCompany({ ...editingCompany, contactEmail: e.target.value })} />
                          <input className={INPUT} placeholder="Contact phone" value={editingCompany.contactPhone} onChange={(e) => setEditingCompany({ ...editingCompany, contactPhone: e.target.value })} />
                        </div>
                      ) : (
                        <div className="text-xs leading-5">
                          <div>{company.contact_name ?? '—'}</div>
                          {company.contact_email && <div className="text-gray-500">{company.contact_email}</div>}
                          {company.contact_phone && <div className="text-gray-500">{company.contact_phone}</div>}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{company.floors.map((floor) => floor.label).join(', ') || '—'}</td>
                    <td className="px-5 py-3 text-gray-600">
                      <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {users.length}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${company.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {company.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {canManageCompanies && (
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {editing ? (
                            <>
                              <button
                                type="button"
                                className={SECONDARY}
                                disabled={busy === `company-${company.id}`}
                                onClick={async () => {
                                  const { id, ...fields } = editingCompany
                                  const ok = await call(`company-${id}`, `${base}/companies/${id}`, 'PATCH', fields, 'Company updated.')
                                  if (ok) setEditingCompany(null)
                                }}
                              >
                                Save
                              </button>
                              <button type="button" className={ICON_BUTTON} title="Cancel" onClick={() => setEditingCompany(null)}><X className="h-4 w-4" /></button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className={ICON_BUTTON}
                                title="Edit"
                                onClick={() => setEditingCompany({
                                  id: company.id,
                                  name: company.name,
                                  contactName: company.contact_name ?? '',
                                  contactEmail: company.contact_email ?? '',
                                  contactPhone: company.contact_phone ?? '',
                                })}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                className={`${SECONDARY} text-xs`}
                                disabled={busy === `toggle-${company.id}`}
                                onClick={() => {
                                  if (company.is_active && !confirm(`Deactivate ${company.name}? Its floors become vacant and its users lose access to requests.`)) return
                                  void call(`toggle-${company.id}`, `${base}/companies/${company.id}`, 'PATCH', { isActive: !company.is_active }, company.is_active ? 'Company deactivated.' : 'Company reactivated.')
                                }}
                              >
                                {company.is_active ? 'Deactivate' : 'Reactivate'}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Tenant users */}
      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
          <Users className="h-4 w-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">Tenant users</h3>
          {unlinked.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">{unlinked.length} not linked</span>
          )}
        </div>
        <p className="border-b border-gray-100 px-5 py-3 text-xs text-gray-500">
          Tenant users only see their company&apos;s work requests. Users not linked to a company cannot submit or view requests.
          Linking a user also attaches the requests they submitted earlier to that company.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Company</th>
                {canManageCompanies && <th className="px-5 py-3 text-right">Link to company</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tenantMembers.length === 0 ? (
                <tr><td colSpan={3} className="px-5 py-10 text-center text-gray-400">No tenant users yet.</td></tr>
              ) : [...unlinked, ...linked].map((member) => (
                <tr key={member.id} className={member.is_active ? '' : 'text-gray-400'}>
                  <td className="px-5 py-3">
                    <div className="font-medium text-gray-900">{member.full_name}</div>
                    <div className="text-xs text-gray-500">{member.email}{member.is_active ? '' : ' · inactive'}</div>
                  </td>
                  <td className="px-5 py-3">
                    {member.company_id ? (
                      <span className="text-gray-700">{companyName(member.company_id) ?? 'Unknown company'}</span>
                    ) : (
                      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">Not linked</span>
                    )}
                  </td>
                  {canManageCompanies && (
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <select
                          className={`${INPUT} max-w-[14rem]`}
                          value={linkChoice[member.id] ?? ''}
                          onChange={(e) => setLinkChoice((c) => ({ ...c, [member.id]: e.target.value }))}
                        >
                          <option value="">{member.company_id ? 'Move to company…' : 'Select company…'}</option>
                          {activeCompanies
                            .filter((company) => company.id !== member.company_id)
                            .map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                        </select>
                        <button
                          type="button"
                          className={SECONDARY}
                          disabled={!linkChoice[member.id] || busy === `link-${member.id}`}
                          onClick={async () => {
                            const companyId = linkChoice[member.id]
                            const ok = await call(`link-${member.id}`, `${base}/companies/${companyId}/members`, 'POST', { engineerId: member.id }, `${member.full_name} linked to ${companyName(companyId)}.`)
                            if (ok) setLinkChoice((c) => ({ ...c, [member.id]: '' }))
                          }}
                        >
                          <Link2 className="h-4 w-4" /> Link
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
