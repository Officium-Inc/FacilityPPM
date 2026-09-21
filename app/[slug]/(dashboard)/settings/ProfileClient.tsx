'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Save, KeyRound } from 'lucide-react'

interface Props {
  fullName: string
  email: string
  phone: string
  roleName: string | null
}

export default function ProfileClient({ fullName, email, phone, roleName }: Props) {
  const router = useRouter()
  const [name, setName] = useState(fullName)
  const [phoneValue, setPhoneValue] = useState(phone)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function patchProfile(payload: Record<string, string>) {
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed to save.')
  }

  async function handleSaveDetails(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    if (!name.trim()) {
      setError('Full name is required.')
      return
    }
    setSaving(true)
    try {
      await patchProfile({ full_name: name, phone: phoneValue })
      setSuccess('Profile updated.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile.')
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setSavingPassword(true)
    try {
      await patchProfile({ new_password: newPassword })
      setNewPassword('')
      setConfirmPassword('')
      setSuccess('Password updated.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password.')
    } finally {
      setSavingPassword(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20'

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>
      )}

      <form onSubmit={handleSaveDetails} className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h3 className="text-sm font-semibold text-gray-900">Personal details</h3>
          <p className="mt-0.5 text-xs text-gray-500">Your name and contact information for this property</p>
        </div>
        <div className="space-y-4 p-6">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Full name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Email</label>
              <input
                type="email"
                value={email}
                disabled
                className={`${inputClass} cursor-not-allowed bg-gray-50 text-gray-500`}
              />
              <p className="mt-1 text-xs text-gray-400">Email is used for sign-in and cannot be changed here.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Phone</label>
              <input
                type="tel"
                value={phoneValue}
                onChange={(e) => setPhoneValue(e.target.value)}
                placeholder="Optional"
                className={inputClass}
              />
            </div>
          </div>
          {roleName && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Role</label>
              <span className="inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-medium capitalize text-gray-700">
                {roleName.replace(/_/g, ' ')}
              </span>
            </div>
          )}
        </div>
        <div className="flex justify-end border-t border-gray-100 px-6 py-4">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </form>

      <form onSubmit={handleChangePassword} className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h3 className="text-sm font-semibold text-gray-900">Change password</h3>
          <p className="mt-0.5 text-xs text-gray-500">Use at least 8 characters</p>
        </div>
        <div className="grid gap-4 p-6 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
        </div>
        <div className="flex justify-end border-t border-gray-100 px-6 py-4">
          <button
            type="submit"
            disabled={savingPassword || !newPassword}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <KeyRound className="h-4 w-4" />
            {savingPassword ? 'Updating...' : 'Update password'}
          </button>
        </div>
      </form>
    </div>
  )
}
