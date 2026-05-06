'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function NewPropertyPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [licenseStatus, setLicenseStatus] = useState<'active' | 'trial' | 'suspended'>('trial')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function handleNameChange(value: string) {
    setName(value)
    // Auto-generate slug from name
    const autoSlug = value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
    setSlug(autoSlug)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/provider/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug, license_status: licenseStatus }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Failed to create property.')
      setLoading(false)
      return
    }

    router.push(`/provider/properties/${slug}`)
  }

  return (
    <div className="max-w-lg space-y-6">
      <Link
        href="/provider/properties"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Properties
      </Link>

      <div>
        <h2 className="text-xl font-bold text-gray-900">Add New Property</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Create a new property and assign a superadmin after saving.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Property Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="BGC Tower 3"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              URL Slug
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">facility.ppm/</span>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) =>
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                }
                placeholder="bgc-tower-3"
                pattern="[a-z0-9\-]+"
                title="Lowercase letters, numbers, and hyphens only"
                className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Lowercase letters, numbers, and hyphens only. Cannot be changed later.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Initial License Status
            </label>
            <select
              value={licenseStatus}
              onChange={(e) => setLicenseStatus(e.target.value as typeof licenseStatus)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="trial">Trial</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
          >
            {loading ? 'Creating…' : 'Create Property'}
          </button>
        </form>
      </div>
    </div>
  )
}
