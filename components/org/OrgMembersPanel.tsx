'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Mail, Pencil, RefreshCw, Trash2, Users, X } from 'lucide-react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import {
  assignableOrgRoles,
  canManageOrgMember,
  formatOrgRole,
  type OrgActorLike,
  type OrgRole,
} from '@/lib/org/roles'
import type { OrgInvitationView, OrgMemberView } from '@/lib/org/overview'

interface Props {
  /** `/api/provider/organizations/<slug>` (Platform Admin) or `/api/org/<slug>` (org portal). */
  apiBase: string
  organizationName: string
  members: OrgMemberView[]
  invitations: OrgInvitationView[]
  actor: OrgActorLike & { memberId?: string }
}

type Message = { type: 'success' | 'error'; text: string } | null

function Notice({ message }: { message: Message }) {
  if (!message) return null
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${message.type === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
      {message.text}
    </div>
  )
}

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500'

/** Org Admins (owners and admins) and their invitations (D30). Every Org Admin is an Administrator in every property. */
export default function OrgMembersPanel({ apiBase, organizationName, members, invitations, actor }: Props) {
  const router = useRouter()
  const roles = assignableOrgRoles(actor)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRole, setEditRole] = useState<OrgRole>('admin')
  const [editActive, setEditActive] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [listMessage, setListMessage] = useState<Message>(null)
  const [confirmRemove, setConfirmRemove] = useState<OrgMemberView | null>(null)

  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<OrgRole>(roles.includes('admin') ? 'admin' : roles[0] ?? 'admin')
  const [inviting, setInviting] = useState(false)
  const [inviteMessage, setInviteMessage] = useState<Message>(null)

  const isSelf = (member: OrgMemberView) => actor.kind === 'org_member' && actor.memberId === member.id
  const canManage = (role: string) => roles.length > 0 && canManageOrgMember(actor, role)

  async function call(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, data: data as { error?: string } }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true)
    setInviteMessage(null)
    const { ok, data } = await call(`${apiBase}/members`, 'POST', { email: inviteEmail, name: inviteName, org_role: inviteRole })
    setInviting(false)
    if (!ok) {
      setInviteMessage({ type: 'error', text: data.error ?? 'Could not send the invitation.' })
      return
    }
    setInviteMessage({ type: 'success', text: `Invitation sent to ${inviteEmail}.` })
    setInviteEmail('')
    setInviteName('')
    router.refresh()
  }

  function startEdit(member: OrgMemberView) {
    setEditingId(member.id)
    setEditRole(member.org_role === 'owner' ? 'owner' : 'admin')
    setEditActive(member.is_active)
    setListMessage(null)
  }

  async function saveEdit(member: OrgMemberView) {
    setBusyId(member.id)
    const payload: Record<string, unknown> = {}
    if (editRole !== member.org_role) payload.org_role = editRole
    if (editActive !== member.is_active) payload.is_active = editActive
    const { ok, data } = Object.keys(payload).length
      ? await call(`${apiBase}/members/${member.id}`, 'PATCH', payload)
      : { ok: true, data: {} }
    setBusyId(null)
    if (!ok) {
      setListMessage({ type: 'error', text: data.error ?? 'Update failed.' })
      return
    }
    setEditingId(null)
    router.refresh()
  }

  async function remove(member: OrgMemberView) {
    setConfirmRemove(null)
    setBusyId(member.id)
    const { ok, data } = await call(`${apiBase}/members/${member.id}`, 'DELETE')
    setBusyId(null)
    if (!ok) {
      setListMessage({ type: 'error', text: data.error ?? 'Remove failed.' })
      return
    }
    router.refresh()
  }

  async function inviteAction(invitation: OrgInvitationView, method: 'PATCH' | 'DELETE') {
    setBusyId(invitation.id)
    const { ok, data } = await call(`${apiBase}/invitations/${invitation.id}`, method)
    setBusyId(null)
    setInviteMessage(ok
      ? { type: 'success', text: method === 'PATCH' ? `Invitation resent to ${invitation.email}.` : 'Invitation revoked.' }
      : { type: 'error', text: data.error ?? 'Request failed.' })
    if (ok) router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
          <Users className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Organization administrators ({members.length})</h3>
        </div>
        <p className="px-5 pt-3 text-xs text-gray-500">
          Each organization administrator is an Administrator in every property of {organizationName}, including properties added later.
        </p>
        {listMessage && <div className="px-5 pt-3"><Notice message={listMessage} /></div>}

        {members.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-400">No organization administrators yet. Invite the first owner below.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Name', 'Email', 'Role', 'Status', ''].map((heading) => (
                    <th key={heading} className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {members.map((member) => {
                  const editing = editingId === member.id
                  const manageable = canManage(member.org_role) && !isSelf(member)
                  return (
                    <tr key={member.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">
                        {member.full_name || '—'}
                        {isSelf(member) && <span className="ml-2 text-xs font-normal text-gray-400">(you)</span>}
                      </td>
                      <td className="px-5 py-3 text-gray-500">{member.email}</td>
                      <td className="px-5 py-3">
                        {editing ? (
                          <select value={editRole} onChange={(e) => setEditRole(e.target.value as OrgRole)} className="rounded border border-gray-300 px-2 py-1 text-sm">
                            {(roles.includes(member.org_role as OrgRole) ? roles : [member.org_role as OrgRole, ...roles]).map((role) => (
                              <option key={role} value={role}>{formatOrgRole(role)}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-700">{formatOrgRole(member.org_role)}</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {editing ? (
                          <select value={editActive ? 'active' : 'inactive'} onChange={(e) => setEditActive(e.target.value === 'active')} className="rounded border border-gray-300 px-2 py-1 text-sm">
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        ) : (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${member.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {member.is_active ? 'Active' : 'Inactive'}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {manageable && (
                          <div className="flex items-center justify-end gap-1.5">
                            {editing ? (
                              <>
                                <button onClick={() => saveEdit(member)} disabled={busyId === member.id} className="rounded p-1.5 text-green-600 hover:bg-green-50 disabled:opacity-40" title="Save">
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => setEditingId(null)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100" title="Cancel">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => startEdit(member)} className="rounded p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600" title="Edit">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => setConfirmRemove(member)} disabled={busyId === member.id} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40" title="Remove from the organization">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {roles.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            <Mail className="h-4 w-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900">Invite an organization administrator</h3>
          </div>
          <form onSubmit={invite} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
              <input type="text" value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Full name (optional)" className={INPUT} />
              <input type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="email@example.com" className={INPUT} />
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as OrgRole)} className={INPUT}>
                {roles.map((role) => <option key={role} value={role}>{formatOrgRole(role)}</option>)}
              </select>
              <button type="submit" disabled={inviting} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-800 disabled:bg-blue-400">
                <Mail className="h-4 w-4" />
                {inviting ? 'Sending…' : 'Send invite'}
              </button>
            </div>
            <p className="text-xs text-gray-400">Owners can also invite and change other owners. The organization keeps at least one active owner.</p>
            <Notice message={inviteMessage} />
          </form>

          {invitations.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">Pending invitations</p>
              <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-100">
                {invitations.map((invitation) => (
                  <div key={invitation.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium text-gray-800">{invitation.email}</span>
                      <span className="ml-2 text-gray-400">{formatOrgRole(invitation.org_role)}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-gray-400">
                        {new Date(invitation.expires_at) < new Date()
                          ? 'Expired'
                          : `Expires ${new Date(invitation.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                      </span>
                      {canManage(invitation.org_role) && (
                        <>
                          <button onClick={() => inviteAction(invitation, 'PATCH')} disabled={busyId === invitation.id} className="rounded p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40" title="Resend invitation">
                            <RefreshCw className={`h-3.5 w-3.5 ${busyId === invitation.id ? 'animate-spin' : ''}`} />
                          </button>
                          <button onClick={() => inviteAction(invitation, 'DELETE')} disabled={busyId === invitation.id} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40" title="Revoke invitation">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmRemove)}
        title="Remove organization administrator"
        message={<>Remove <strong>{confirmRemove?.email}</strong> from {organizationName}? They lose Administrator access to every property of the organization.</>}
        confirmLabel="Remove"
        danger
        onConfirm={() => confirmRemove && remove(confirmRemove)}
        onCancel={() => setConfirmRemove(null)}
      />
    </div>
  )
}
