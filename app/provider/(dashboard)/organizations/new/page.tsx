'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { slugify } from '@/lib/reserved-slugs'

const INPUT = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

export default function NewOrganizationPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [licenseStatus, setLicenseStatus] = useState<'active' | 'trial' | 'suspended'>('trial')
  const [expiresOn, setExpiresOn] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function handleNameChange(value: string) {
    setName(value)
    if (!slugEdited) setSlug(slugify(value))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/provider/organizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        slug,
        license_status: licenseStatus,
        license_expires_at: expiresOn || null,
        owner_email: ownerEmail.trim() || undefined,
        owner_name: ownerName.trim() || undefined,
      }),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error ?? 'Failed to create the organization.')
      setLoading(false)
      return
    }

    const inviteFailed = data.invite && !data.invite.sent
    router.push(`/provider/organizations/${data.organization?.slug ?? slug}${inviteFailed ? '?invite=failed' : ''}`)
  }

  return (
    <div className="max-w-lg space-y-6">
      <Link href="/provider/organizations" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Organizations
      </Link>

      <div>
        <h2 className="text-xl font-bold text-gray-900">Create Organization</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Creates the client account with its license and invites its first Owner. Add properties to it afterwards.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <h3 className="text-sm font-semibold text-gray-900">Organization</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              required
              maxLength={120}
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Ayala Land Offices"
              className={INPUT}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">/org/</span>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => {
                  setSlugEdited(true)
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                }}
                placeholder="ayala-land-offices"
                pattern="[a-z0-9\-]+"
                title="Lowercase letters, numbers, and hyphens only"
                className={`${INPUT} flex-1 font-mono`}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">Lowercase letters, numbers, and hyphens only. Cannot be changed later.</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <h3 className="text-sm font-semibold text-gray-900">License</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={licenseStatus} onChange={(e) => setLicenseStatus(e.target.value as typeof licenseStatus)} className={INPUT}>
                <option value="trial">Trial</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expires on (optional)</label>
              <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className={INPUT} />
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Covers every property of the organization. The license ends at the end of the expiry date (Philippine time).
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">First Owner</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              They receive an email invitation. Owners are Administrators in every property of the organization. You can also invite one later.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
              <input type="text" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Maria Santos" className={INPUT} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="owner@company.com" className={INPUT} />
            </div>
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
        >
          {loading ? 'Creating…' : 'Create Organization'}
        </button>
      </form>
    </div>
  )
}
