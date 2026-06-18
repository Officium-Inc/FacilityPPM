'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import LicenseBadge from '@/components/provider/LicenseBadge'
import { formatRoleName, getCanonicalRoleRows } from '@/lib/roles'
import type { Property, Engineer, Role, LicenseStatus } from '@/types'
import {
  Shield, Users, Trash2, UserPlus, Mail, Pencil, Check, X,
  AlertTriangle, BarChart3, Building2, RefreshCw,
} from 'lucide-react'

interface Invitation {
  id: string
  email: string
  invited_name: string | null
  expires_at: string
  used_at: string | null
  created_at: string
}

interface Props {
  property: Property
  engineers: Engineer[]
  roles: Role[]
  stats: { workOrders: number; assets: number; sites: number }
  invitations: Invitation[]
}

type Tab = 'overview' | 'members' | 'danger'

function Msg({ msg }: { msg: { type: 'success' | 'error'; text: string } }) {
  return (
    <div className={`rounded-lg px-3 py-2 text-sm ${
      msg.type === 'success'
        ? 'bg-green-50 text-green-700 border border-green-200'
        : 'bg-red-50 text-red-700 border border-red-200'
    }`}>
      {msg.text}
    </div>
  )
}

export default function PropertyManageClient({ property, engineers, roles, stats, invitations: initInvites }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('overview')
  const roleRows = getCanonicalRoleRows(roles)

  // ── Overview state ──────────────────────────────────────────────
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus>(property.license_status)
  const [licenseLoading, setLicenseLoading] = useState(false)
  const [licenseMsg, setLicenseMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [propertyName, setPropertyName] = useState(property.name)
  const [nameLoading, setNameLoading] = useState(false)
  const [nameMsg, setNameMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // ── Members state ───────────────────────────────────────────────
  const [memberList, setMemberList] = useState<Engineer[]>(engineers)
  const [inviteList, setInviteList] = useState<Invitation[]>(initInvites)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRoleId, setEditRoleId] = useState<string>('')
  const [editActive, setEditActive] = useState<boolean>(true)
  const [memberMsg, setMemberMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminMsg, setAdminMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deletingInviteId, setDeletingInviteId] = useState<string | null>(null)
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null)

  // ── Danger zone state ────────────────────────────────────────────
  const [confirmName, setConfirmName] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteMsg, setDeleteMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // ── Handlers ─────────────────────────────────────────────────────

  async function handleLicenseUpdate(e: React.FormEvent) {
    e.preventDefault()
    setLicenseLoading(true)
    setLicenseMsg(null)
    const res = await fetch(`/api/provider/properties/${property.slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_status: licenseStatus }),
    })
    const data = await res.json()
    setLicenseMsg(res.ok ? { type: 'success', text: 'License updated.' } : { type: 'error', text: data.error })
    if (res.ok) router.refresh()
    setLicenseLoading(false)
  }

  async function handleNameUpdate(e: React.FormEvent) {
    e.preventDefault()
    setNameLoading(true)
    setNameMsg(null)
    const res = await fetch(`/api/provider/properties/${property.slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: propertyName }),
    })
    const data = await res.json()
    setNameMsg(res.ok ? { type: 'success', text: 'Name updated.' } : { type: 'error', text: data.error })
    if (res.ok) router.refresh()
    setNameLoading(false)
  }

  async function handleAddAdmin(e: React.FormEvent) {
    e.preventDefault()
    setAdminLoading(true)
    setAdminMsg(null)
    const res = await fetch(`/api/provider/properties/${property.slug}/superadmin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: adminName, email: adminEmail, password: adminPassword }),
    })
    const data = await res.json()
    if (!res.ok) {
      setAdminMsg({ type: 'error', text: data.error ?? 'Failed to create account.' })
    } else {
      setAdminMsg({ type: 'success', text: `Account created for ${adminEmail}.` })
      setAdminName(''); setAdminEmail(''); setAdminPassword('')
      router.refresh()
    }
    setAdminLoading(false)
  }

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteMsg(null)

    // Client-side duplicate guard
    const normalised = inviteEmail.trim().toLowerCase()
    const alreadyPending = inviteList.some(
      (i) => !i.used_at && i.email.toLowerCase() === normalised
    )
    if (alreadyPending) {
      setInviteMsg({ type: 'error', text: 'A pending invitation for this email already exists.' })
      return
    }

    setInviteLoading(true)
    const res = await fetch(`/api/provider/properties/${property.slug}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, name: inviteName }),
    })
    const data = await res.json()
    if (!res.ok) {
      setInviteMsg({ type: 'error', text: data.error ?? 'Failed to send invite.' })
    } else {
      setInviteMsg({ type: 'success', text: `Invitation sent to ${inviteEmail}.` })
      setInviteEmail(''); setInviteName('')
      router.refresh()
    }
    setInviteLoading(false)
  }

  async function handleDeleteInvite(inviteId: string) {
    setDeletingInviteId(inviteId)
    const res = await fetch(
      `/api/provider/properties/${property.slug}/invite/${inviteId}`,
      { method: 'DELETE' },
    )
    if (res.ok) {
      setInviteList((prev) => prev.filter((i) => i.id !== inviteId))
    } else {
      const data = await res.json()
      setInviteMsg({ type: 'error', text: data.error ?? 'Failed to delete invitation.' })
    }
    setDeletingInviteId(null)
  }

  async function handleResendInvite(inviteId: string) {
    setResendingInviteId(inviteId)
    const res = await fetch(
      `/api/provider/properties/${property.slug}/invite/${inviteId}`,
      { method: 'PATCH' },
    )
    const data = await res.json()
    if (res.ok) {
      // Update local expires_at so the row reflects the new expiry
      setInviteList((prev) =>
        prev.map((i) =>
          i.id === inviteId ? { ...i, expires_at: data.expires_at } : i
        )
      )
      setInviteMsg({ type: 'success', text: 'Invitation resent successfully.' })
    } else {
      setInviteMsg({ type: 'error', text: data.error ?? 'Failed to resend invitation.' })
    }
    setResendingInviteId(null)
  }

  function startEdit(member: Engineer) {
    setEditingId(member.id)
    setEditRoleId(member.role_id ?? '')
    setEditActive(member.is_active)
    setMemberMsg(null)
  }

  async function saveEdit(memberId: string) {
    const res = await fetch(`/api/provider/properties/${property.slug}/members/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_id: editRoleId || null, is_active: editActive }),
    })
    const data = await res.json()
    if (!res.ok) {
      setMemberMsg({ type: 'error', text: data.error ?? 'Update failed.' })
    } else {
      setMemberList((prev) =>
        prev.map((m) =>
          m.id === memberId
            ? { ...m, role_id: editRoleId || null, is_active: editActive, roles: roleRows.find((r) => r.id === editRoleId) }
            : m
        )
      )
      setEditingId(null)
    }
  }

  async function handleRemoveMember(memberId: string) {
    setRemovingId(memberId)
    const res = await fetch(`/api/provider/properties/${property.slug}/members/${memberId}`, {
      method: 'DELETE',
    })
    const data = await res.json()
    if (!res.ok) {
      setMemberMsg({ type: 'error', text: data.error ?? 'Remove failed.' })
    } else {
      setMemberList((prev) => prev.filter((m) => m.id !== memberId))
    }
    setRemovingId(null)
  }

  async function handleDeleteProperty() {
    setDeleteLoading(true)
    setDeleteMsg(null)
    const res = await fetch(`/api/provider/properties/${property.slug}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) {
      setDeleteMsg({ type: 'error', text: data.error ?? 'Deletion failed.' })
      setDeleteLoading(false)
    } else {
      router.push('/provider/properties')
      router.refresh()
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'members', label: `Members (${memberList.length})`, icon: Users },
    { id: 'danger', label: 'Danger Zone', icon: AlertTriangle },
  ]

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              tab === id
                ? id === 'danger'
                  ? 'border-red-500 text-red-600'
                  : 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ─────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Work Orders', value: stats.workOrders, emoji: '📋' },
              { label: 'Assets', value: stats.assets, emoji: '⚙️' },
              { label: 'Sites', value: stats.sites, emoji: '🏢' },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-2xl mb-1">{s.emoji}</p>
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Property Name */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-4 h-4 text-gray-500" />
              <h3 className="font-semibold text-gray-900 text-sm">Property Name</h3>
            </div>
            <form onSubmit={handleNameUpdate} className="flex gap-3">
              <input
                type="text"
                required
                value={propertyName}
                onChange={(e) => setPropertyName(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="submit"
                disabled={nameLoading || propertyName === property.name}
                className="bg-blue-700 hover:bg-blue-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
              >
                {nameLoading ? 'Saving…' : 'Rename'}
              </button>
            </form>
            {nameMsg && <div className="mt-3"><Msg msg={nameMsg} /></div>}
          </div>

          {/* License */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-gray-500" />
              <h3 className="font-semibold text-gray-900 text-sm">License Status</h3>
            </div>
            <form onSubmit={handleLicenseUpdate} className="space-y-4">
              <div className="flex items-center gap-4">
                {(['active', 'trial', 'suspended'] as LicenseStatus[]).map((status) => (
                  <label key={status} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="license"
                      value={status}
                      checked={licenseStatus === status}
                      onChange={() => setLicenseStatus(status)}
                      className="text-blue-600"
                    />
                    <LicenseBadge status={status} />
                  </label>
                ))}
              </div>
              {licenseMsg && <Msg msg={licenseMsg} />}
              <button
                type="submit"
                disabled={licenseLoading || licenseStatus === property.license_status}
                className="bg-blue-700 hover:bg-blue-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
              >
                {licenseLoading ? 'Saving…' : 'Update License'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── MEMBERS TAB ──────────────────────────────────────────── */}
      {tab === 'members' && (
        <div className="space-y-6">
          {/* Member list */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
              <Users className="w-4 h-4 text-gray-500" />
              <h3 className="font-semibold text-gray-900 text-sm">Members ({memberList.length})</h3>
            </div>

            {memberMsg && <div className="px-5 pt-3"><Msg msg={memberMsg} /></div>}

            {memberList.length === 0 ? (
              <p className="px-5 py-10 text-center text-gray-400 text-sm">No members yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Name', 'Email', 'Role', 'Status', 'Actions'].map((h) => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {memberList.map((member) => (
                    <tr key={member.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                            <span className="text-blue-700 font-medium text-xs uppercase">
                              {member.full_name.charAt(0)}
                            </span>
                          </div>
                          <span className="font-medium text-gray-900">{member.full_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-500">{member.email}</td>
                      <td className="px-5 py-3">
                        {editingId === member.id ? (
                          <select
                            value={editRoleId}
                            onChange={(e) => setEditRoleId(e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">— No role —</option>
                            {roleRows.map((r) => (
                              <option key={r.id} value={r.id}>{formatRoleName(r.name)}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-700">{formatRoleName(member.roles?.name, '—')}</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {editingId === member.id ? (
                          <select
                            value={editActive ? 'active' : 'inactive'}
                            onChange={(e) => setEditActive(e.target.value === 'active')}
                            className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        ) : (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            member.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {member.is_active ? 'Active' : 'Inactive'}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5">
                          {editingId === member.id ? (
                            <>
                              <button onClick={() => saveEdit(member.id)} className="p-1.5 rounded text-green-600 hover:bg-green-50" title="Save">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setEditingId(null)} className="p-1.5 rounded text-gray-400 hover:bg-gray-100" title="Cancel">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEdit(member)} className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50" title="Edit">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleRemoveMember(member.id)}
                                disabled={removingId === member.id}
                                className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40"
                                title="Remove from property"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Invite by email */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Mail className="w-4 h-4 text-gray-500" />
              <h3 className="font-semibold text-gray-900 text-sm">Invite by Email</h3>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Send an invitation link. The recipient sets their own password. If they already have a Tenant360 account they&apos;ll be added automatically.
            </p>
            <form onSubmit={handleSendInvite} className="space-y-3">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Full name (optional)"
                  className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm shrink-0"
                >
                  <Mail className="w-4 h-4" />
                  {inviteLoading ? 'Sending…' : 'Send Invite'}
                </button>
              </div>
              {inviteMsg && <Msg msg={inviteMsg} />}
            </form>

            {inviteList.filter((i) => !i.used_at).length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Pending Invitations</p>
                <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
                  {inviteList.filter((i) => !i.used_at).map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <div>
                        <span className="font-medium text-gray-800">{inv.email}</span>
                        {inv.invited_name && <span className="text-gray-400 ml-2">({inv.invited_name})</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">
                          Expires {new Date(inv.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </span>
                        <button
                          onClick={() => handleResendInvite(inv.id)}
                          disabled={resendingInviteId === inv.id || deletingInviteId === inv.id}
                          className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-40 transition-colors"
                          title="Resend invitation"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${resendingInviteId === inv.id ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          onClick={() => handleDeleteInvite(inv.id)}
                          disabled={deletingInviteId === inv.id || resendingInviteId === inv.id}
                          className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
                          title="Delete invitation"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Add directly with password */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <UserPlus className="w-4 h-4 text-gray-500" />
              <h3 className="font-semibold text-gray-900 text-sm">Add Member Directly</h3>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Create an account with a temporary password you share manually.
            </p>
            <form onSubmit={handleAddAdmin} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
                  <input
                    type="text" required value={adminName} onChange={(e) => setAdminName(e.target.value)}
                    placeholder="Juan dela Cruz"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input
                    type="email" required value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="admin@example.com"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Temporary Password</label>
                <input
                  type="text" required minLength={8} value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                />
              </div>
              {adminMsg && <Msg msg={adminMsg} />}
              <button
                type="submit" disabled={adminLoading}
                className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-900 disabled:bg-gray-300 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
              >
                <UserPlus className="w-4 h-4" />
                {adminLoading ? 'Creating…' : 'Create Account'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── DANGER ZONE TAB ──────────────────────────────────────── */}
      {tab === 'danger' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border-2 border-red-200 p-6">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <h3 className="font-semibold text-red-700">Terminate Property</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              This will <strong>permanently delete</strong> <em>{property.name}</em> and all associated data — work orders, assets, engineers, sites, schedules, and checklist history. This action <strong>cannot be undone</strong>.
            </p>
            <p className="text-sm text-gray-600 mb-2">
              Type <strong>{property.name}</strong> to confirm:
            </p>
            <div className="space-y-3">
              <input
                type="text"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={property.name}
                className="w-full px-3 py-2.5 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
              />
              {deleteMsg && <Msg msg={deleteMsg} />}
              <button
                onClick={handleDeleteProperty}
                disabled={deleteLoading || confirmName !== property.name}
                className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium py-2.5 px-5 rounded-lg transition-colors text-sm"
              >
                <Trash2 className="w-4 h-4" />
                {deleteLoading ? 'Deleting…' : 'Permanently Delete Property'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
