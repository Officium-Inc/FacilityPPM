'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield } from 'lucide-react'
import LicenseBadge from '@/components/provider/LicenseBadge'
import { LICENSE_STATUSES, licenseDateInput, licenseState } from '@/lib/provider/license'
import { describeAuditEntry, LICENSE_HISTORY_ACTIONS } from '@/lib/provider/audit-labels'
import type { AuditEntry } from '@/lib/provider/activity'
import type { LicenseStatus } from '@/types'
import { formatPHT } from '@/lib/utils'

interface Props {
  slug: string
  licenseStatus: LicenseStatus
  licenseExpiresAt: string | null
  terminated: boolean
  audit: AuditEntry[]
}

/** License status and expiry (add, renew, suspend) with its audit-logged history (D17). */
export default function LicensePanel({ slug, licenseStatus, licenseExpiresAt, terminated, audit }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState<LicenseStatus>(licenseStatus)
  const [expiresOn, setExpiresOn] = useState(licenseDateInput(licenseExpiresAt))
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const currentState = licenseState({ license_status: licenseStatus, license_expires_at: licenseExpiresAt })
  const unchanged = status === licenseStatus && expiresOn === licenseDateInput(licenseExpiresAt)
  const history = audit.filter((entry) => LICENSE_HISTORY_ACTIONS.has(entry.action))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    const res = await fetch(`/api/provider/properties/${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_status: status, license_expires_at: expiresOn || null }),
    })
    const data = await res.json().catch(() => ({}))
    setLoading(false)
    setMessage(res.ok ? { type: 'success', text: 'License updated.' } : { type: 'error', text: data.error ?? 'Update failed.' })
    if (res.ok) router.refresh()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-gray-500" />
          <h3 className="font-semibold text-gray-900 text-sm">License</h3>
        </div>
        <LicenseBadge status={terminated ? 'terminated' : currentState} />
      </div>

      {terminated ? (
        <p className="text-sm text-gray-600">
          The account is terminated. Reactivate it from the Danger Zone tab to restore the license and its members.
        </p>
      ) : (
        <form onSubmit={save} className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            {LICENSE_STATUSES.map((option) => (
              <label key={option} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="license"
                  value={option}
                  checked={status === option}
                  onChange={() => setStatus(option)}
                  className="text-blue-600"
                />
                <LicenseBadge status={option} />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Expires on</label>
              <input
                type="date"
                value={expiresOn}
                onChange={(e) => setExpiresOn(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {expiresOn && (
              <button type="button" onClick={() => setExpiresOn('')} className="text-xs text-gray-500 hover:text-gray-700 pb-2.5">
                Remove end date
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400">
            Suspended or expired licenses lock every member out of the property. Expiry is at the end of the day, Philippine time.
          </p>
          {message && (
            <div className={`rounded-lg px-3 py-2 text-sm border ${message.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
              {message.text}
            </div>
          )}
          <button
            type="submit"
            disabled={loading || unchanged}
            className="bg-blue-700 hover:bg-blue-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
          >
            {loading ? 'Saving…' : 'Update License'}
          </button>
        </form>
      )}

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">History</h4>
        {history.length === 0 ? (
          <p className="text-sm text-gray-400">No license changes recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((entry) => (
              <li key={entry.id} className="text-sm text-gray-700">
                <span className="text-xs text-gray-400 mr-2">{formatPHT(entry.created_at, true)}</span>
                {describeAuditEntry(entry)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
