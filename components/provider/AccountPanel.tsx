'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Power, RotateCcw } from 'lucide-react'
import { formatPHT } from '@/lib/utils'

interface Props {
  slug: string
  propertyName: string
  terminated: boolean
  terminatedAt: string | null
  reason: string | null
}

/** Terminate (reversible) or reactivate a property account (D18). */
export default function AccountPanel({ slug, propertyName, terminated, terminatedAt, reason }: Props) {
  const router = useRouter()
  const [terminateReason, setTerminateReason] = useState('')
  const [confirmName, setConfirmName] = useState('')
  const [licenseStatus, setLicenseStatus] = useState<'active' | 'trial'>('active')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function submit(body: Record<string, unknown>, success: (data: Record<string, unknown>) => string) {
    setLoading(true)
    setMessage(null)
    const res = await fetch(`/api/provider/properties/${encodeURIComponent(slug)}/account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) {
      setMessage({ type: 'error', text: data.error ?? 'Request failed.' })
      return
    }
    setMessage({ type: 'success', text: success(data) })
    setConfirmName('')
    setTerminateReason('')
    router.refresh()
  }

  const notice = message && (
    <div className={`rounded-lg px-3 py-2 text-sm border ${message.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
      {message.text}
    </div>
  )

  if (terminated) {
    return (
      <div className="bg-white rounded-xl border-2 border-gray-300 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <RotateCcw className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold text-gray-900">Reactivate Account</h3>
        </div>
        <p className="text-sm text-gray-600">
          Terminated{terminatedAt ? ` on ${formatPHT(terminatedAt, true)}` : ''}{reason ? ` — ${reason}` : ''}. Reactivating restores
          the license, the members deactivated by the termination and their sign-in.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={licenseStatus}
            onChange={(e) => setLicenseStatus(e.target.value as 'active' | 'trial')}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="active">Active license</option>
            <option value="trial">Trial license</option>
          </select>
          <button
            type="button"
            disabled={loading}
            onClick={() => submit(
              { action: 'reactivate', license_status: licenseStatus },
              (data) => `Account reactivated. ${Number(data.reactivated ?? 0)} member(s) restored.`
            )}
            className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
          >
            <RotateCcw className="w-4 h-4" />
            {loading ? 'Reactivating…' : 'Reactivate Account'}
          </button>
        </div>
        {notice}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border-2 border-orange-200 p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Power className="w-5 h-5 text-orange-500" />
        <h3 className="font-semibold text-orange-700">Terminate Account</h3>
      </div>
      <p className="text-sm text-gray-600">
        Suspends the license, deactivates every member of <em>{propertyName}</em> and blocks the sign-in of members who
        do not belong to another property. No data is deleted, and the account can be reactivated later.
      </p>
      <textarea
        value={terminateReason}
        onChange={(e) => setTerminateReason(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder="Reason (kept in the audit log)"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
      />
      <p className="text-sm text-gray-600">Type <strong>{propertyName}</strong> to confirm:</p>
      <input
        type="text"
        value={confirmName}
        onChange={(e) => setConfirmName(e.target.value)}
        placeholder={propertyName}
        className="w-full px-3 py-2.5 border border-orange-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
      />
      {notice}
      <button
        type="button"
        disabled={loading || confirmName !== propertyName}
        onClick={() => submit(
          { action: 'terminate', reason: terminateReason },
          (data) => `Account terminated. ${Number(data.deactivated ?? 0)} member(s) deactivated, ${Number(data.banned ?? 0)} sign-in(s) blocked.`
        )}
        className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium py-2.5 px-5 rounded-lg transition-colors text-sm"
      >
        <Power className="w-4 h-4" />
        {loading ? 'Terminating…' : 'Terminate Account'}
      </button>
    </div>
  )
}
