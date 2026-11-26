'use client'

import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, X, Pencil, Trash2, Mail, Clock, XCircle, ShieldCheck } from 'lucide-react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { formatRoleName } from '@/lib/roles'
import { can, type ClientActor } from '@/lib/authz/permissions'
import { canAssignRole, canManageMemberRole } from '@/lib/authz/escalation'
import { WORK_TYPE_LABELS } from '@/lib/authz/templates'
import type { PropertyRole } from '@/lib/authz/property-role'

interface Engineer {
  id: string
  full_name: string
  email: string
  phone?: string | null
  certifications?: string | null
  is_active: boolean
  property_role_id?: string | null
  /** Administrator rows of Org Admins are managed from the organization (D30). */
  org_member_id?: string | null
}
interface Invitation {
  id: string
  email: string
  invited_name: string | null
  role_name: string | null
  property_role_id?: string | null
  invited_by: string | null
  created_at: string
  expires_at: string
}

interface Props {
  slug: string
  engineers: Engineer[]
  /** Every role of the property, with effective permissions. */
  roles: PropertyRole[]
  invitations: Invitation[]
  canManageMembers: boolean
  /** The signed-in user; limits which roles they may give and which members they may manage (escalation rule). */
  actor: ClientActor
  /** Active tenant companies; tenant-portal invitations must name one. */
  companies: Array<{ id: string; name: string }>
}

type ConfirmRemove = { id: string; name: string } | null

const EMPTY_INVITE = { email: '', name: '', property_role_id: '', company_id: '' }
const INPUT = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500'

function WorkTypeBadge({ role }: { role: PropertyRole | undefined }) {
  if (!role || role.workType === 'none') return null
  return (
    <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
      {WORK_TYPE_LABELS[role.workType]}
    </span>
  )
}

export default function EngineersClient({ slug, engineers, roles, invitations: initialInvitations, canManageMembers, actor, companies }: Props) {
  const router = useRouter()
  const roleById = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles])
  // Roles this user may give: escalation rule (only roles with less access than their own; Administrators: all)
  const assignable = useMemo(() => roles.filter((role) => canAssignRole(actor, role)), [roles, actor])

  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [invite, setInvite] = useState(EMPTY_INVITE)
  const [editForm, setEditForm] = useState<{ property_role_id: string; phone: string; certifications: string; is_active: boolean }>({
    property_role_id: '', phone: '', certifications: '', is_active: true,
  })
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<ConfirmRemove>(null)
  const [removeLoading, setRemoveLoading] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [invitations, setInvitations] = useState<Invitation[]>(initialInvitations)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const inviteRole = roleById.get(invite.property_role_id)
  const canManageRow = (eng: Engineer) =>
    canManageMembers && !eng.org_member_id && canManageMemberRole(actor, eng.property_role_id ? roleById.get(eng.property_role_id) ?? null : null)

  function setInv(field: keyof typeof EMPTY_INVITE, value: string) {
    setInvite((f) => ({ ...f, [field]: value }))
  }

  function openEdit(eng: Engineer) {
    setEditId(eng.id)
    setEditForm({
      property_role_id: eng.property_role_id ?? '',
      phone: eng.phone ?? '',
      certifications: eng.certifications ?? '',
      is_active: eng.is_active,
    })
    setError(null)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    const res = await fetch(`/api/properties/${encodeURIComponent(slug)}/members/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: invite.email,
        name: invite.name || undefined,
        property_role_id: invite.property_role_id || undefined,
        company_id: inviteRole?.portal === 'tenant' ? invite.company_id || undefined : undefined,
      }),
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setError(data.error ?? 'Failed to send invitation.')
      setLoading(false)
      return
    }

    setSuccess(`Invitation sent to ${invite.email}`)
    setInvitations((prev) => [
      ...prev,
      {
        id: `pending-${Date.now()}`,
        email: invite.email,
        invited_name: invite.name || null,
        role_name: inviteRole?.name ?? null,
        property_role_id: invite.property_role_id || null,
        invited_by: null,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ])
    setInvite(EMPTY_INVITE)
    setLoading(false)
    router.refresh()
  }

  async function handleCancelInvite(inviteId: string) {
    setCancellingId(inviteId)
    const res = await fetch(`/api/properties/${encodeURIComponent(slug)}/members/invite/${inviteId}`, { method: 'DELETE' })
    if (res.ok) setInvitations((prev) => prev.filter((i) => i.id !== inviteId))
    setCancellingId(null)
  }

  async function handleRemove(id: string) {
    setRemoveLoading(true)
    setRemoveError(null)
    const res = await fetch(`/api/properties/${encodeURIComponent(slug)}/members`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const data = await res.json().catch(() => ({}))
    setRemoveLoading(false)
    if (!res.ok) {
      setRemoveError(data.error ?? 'Could not remove the member.')
      return
    }
    setConfirmRemove(null)
    router.refresh()
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editId) return
    setLoading(true)
    setError(null)

    const current = engineers.find((eng) => eng.id === editId)
    const res = await fetch(`/api/properties/${encodeURIComponent(slug)}/members`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editId,
        // Only send the role when it changed, so a status change works for members whose role you cannot give
        ...(editForm.property_role_id && editForm.property_role_id !== current?.property_role_id
          ? { property_role_id: editForm.property_role_id }
          : {}),
        phone: editForm.phone,
        certifications: editForm.certifications,
        is_active: editForm.is_active,
      }),
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setError(data.error ?? 'Failed to update the member.')
      setLoading(false)
      return
    }

    setEditId(null)
    router.refresh()
    setLoading(false)
  }

  const roleLabel = (roleId: string | null | undefined, fallback?: string | null) =>
    (roleId && roleById.get(roleId)?.name) || formatRoleName(fallback, '—')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Members</h2>
          <p className="text-sm text-gray-500 mt-0.5">{engineers.filter((e) => e.is_active).length} active</p>
        </div>
        <div className="flex items-center gap-2">
          {can(actor, 'members.view') && (
            <Link
              href={`/${slug}/settings/roles`}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <ShieldCheck className="h-4 w-4" />
              Roles &amp; Permissions
            </Link>
          )}
          {canManageMembers && (
            <button
              onClick={() => { setShowAdd(true); setError(null) }}
              className="inline-flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Member
            </button>
          )}
        </div>
      </div>

      {/* Invite form */}
      {canManageMembers && showAdd && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Invite New Member</h3>
              <p className="text-xs text-gray-500 mt-0.5">They&apos;ll receive an email to create their account.</p>
            </div>
            <button onClick={() => { setShowAdd(false); setError(null); setSuccess(null) }} className="text-gray-400 hover:text-gray-600" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>

          {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>}
          {success && (
            <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-2 flex items-center gap-2">
              <Mail className="w-4 h-4 shrink-0" />
              {success}
            </div>
          )}

          <form onSubmit={handleInvite} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
              <input required type="email" value={invite.email} onChange={(e) => setInv('email', e.target.value)} placeholder="member@example.com" className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Name (optional)</label>
              <input value={invite.name} onChange={(e) => setInv('name', e.target.value)} placeholder="Full name" className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Role *</label>
              <select value={invite.property_role_id} onChange={(e) => setInv('property_role_id', e.target.value)} required className={INPUT}>
                <option value="" disabled>{assignable.length ? 'Select a role' : 'You cannot give any role'}</option>
                {assignable.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}{role.portal === 'tenant' ? ' (Tenant Portal)' : role.workType !== 'none' ? ` (${WORK_TYPE_LABELS[role.workType]})` : ''}
                  </option>
                ))}
              </select>
            </div>
            {inviteRole?.portal === 'tenant' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Company *</label>
                <select value={invite.company_id} onChange={(e) => setInv('company_id', e.target.value)} required className={INPUT}>
                  <option value="" disabled>{companies.length ? 'Select the tenant company' : 'Add a company in Floors & Tenants first'}</option>
                  {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                </select>
              </div>
            )}
            <div className="flex items-end sm:col-span-2 sm:justify-end">
              <button
                type="submit" disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-800 disabled:opacity-50 sm:w-auto"
              >
                <Mail className="w-4 h-4" />
                {loading ? 'Sending…' : 'Send Invitation'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Members table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Name', 'Email', 'Phone', 'Role', 'Certifications', 'Status', '', ''].map((h, i) => (
                  <th key={`${h}-${i}`} className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {engineers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-gray-400">No members found.</td>
                </tr>
              ) : (
                engineers.map((eng) => {
                  const role = eng.property_role_id ? roleById.get(eng.property_role_id) : undefined
                  const editable = canManageRow(eng)
                  // The member's current role is kept as a disabled option when the editor cannot give it
                  const editOptions = assignable
                  return (
                    <Fragment key={eng.id}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-900">{eng.full_name}</td>
                        <td className="px-5 py-3 text-gray-600">{eng.email}</td>
                        <td className="px-5 py-3 text-gray-600">{eng.phone ?? '—'}</td>
                        <td className="px-5 py-3 text-gray-600">
                          {role?.name ?? <span className="text-amber-700">No role</span>}
                          <WorkTypeBadge role={role} />
                          {eng.org_member_id && (
                            <span
                              className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700"
                              title="Administrator through the organization; their access is managed by the organization"
                            >
                              Organization
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-gray-600">{eng.certifications ?? '—'}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${eng.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {eng.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          {editable && (
                            <button onClick={() => openEdit(eng)} className="text-gray-400 hover:text-green-600 transition-colors" title="Edit">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {editable && (
                            <button
                              onClick={() => { setRemoveError(null); setConfirmRemove({ id: eng.id, name: eng.full_name }) }}
                              className="text-gray-400 hover:text-red-600 transition-colors"
                              title="Remove"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                      {editId === eng.id && (
                        <tr className="bg-green-50">
                          <td colSpan={8} className="px-5 py-4">
                            {error && <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>}
                            <form onSubmit={handleEdit} className="flex flex-wrap gap-3 items-end">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                                <select
                                  value={editForm.property_role_id}
                                  onChange={(e) => setEditForm((f) => ({ ...f, property_role_id: e.target.value }))}
                                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                                >
                                  {!editOptions.some((option) => option.id === editForm.property_role_id) && (
                                    <option value={editForm.property_role_id} disabled>{role?.name ?? 'No role'}</option>
                                  )}
                                  {editOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
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
                            {roleById.get(editForm.property_role_id)?.portal === 'tenant' && role?.portal !== 'tenant' && (
                              <p className="mt-2 text-xs text-gray-500">Link them to their company on the Floors &amp; Tenants page after saving.</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
          <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-900">Pending Invitations ({invitations.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Email', 'Name', 'Role', 'Invited', 'Expires', ''].map((h, i) => (
                    <th key={`${h}-${i}`} className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invitations.map((inv) => {
                  const invRole = inv.property_role_id ? roleById.get(inv.property_role_id) ?? null : null
                  return (
                    <tr key={inv.id} className="hover:bg-amber-50/50">
                      <td className="px-5 py-3 text-gray-800 font-medium">{inv.email}</td>
                      <td className="px-5 py-3 text-gray-600">{inv.invited_name ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-600">{roleLabel(inv.property_role_id, inv.role_name)}</td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{new Date(inv.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{new Date(inv.expires_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td className="px-5 py-3">
                        {canManageMembers && canManageMemberRole(actor, invRole) && (
                          <button
                            onClick={() => handleCancelInvite(inv.id)}
                            disabled={cancellingId === inv.id || inv.id.startsWith('pending-')}
                            className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800 disabled:opacity-40 transition-colors"
                            title="Cancel invitation"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            {cancellingId === inv.id ? 'Cancelling…' : 'Cancel'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmRemove)}
        title="Remove member"
        message={<>Remove <strong>{confirmRemove?.name}</strong> from this property? They lose access to it. This cannot be undone.</>}
        confirmLabel="Remove"
        busyLabel="Removing…"
        danger
        busy={removeLoading}
        error={removeError}
        onConfirm={() => confirmRemove && handleRemove(confirmRemove.id)}
        onCancel={() => { setConfirmRemove(null); setRemoveError(null) }}
      />
    </div>
  )
}
