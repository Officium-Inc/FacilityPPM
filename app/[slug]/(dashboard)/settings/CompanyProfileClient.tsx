'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Save } from 'lucide-react'
import type { Property } from '@/types'

interface Props {
  property: Pick<Property, 'name' | 'slug' | 'license_status' | 'address' | 'city' | 'country' | 'contact_email' | 'contact_phone' | 'website'>
  canManage: boolean
}

export default function CompanyProfileClient({ property, canManage }: Props) {
  const router = useRouter()
  const [form, setForm] = useState({
    name: property.name ?? '',
    address: property.address ?? '',
    city: property.city ?? '',
    country: property.country ?? '',
    contact_email: property.contact_email ?? '',
    contact_phone: property.contact_phone ?? '',
    website: property.website ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    if (!form.name.trim()) {
      setError('Company name is required.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/company', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed to save.')
      setSuccess('Company profile updated.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save company profile.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500'

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {!canManage && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Your role can view the company profile, but only admins and property managers can edit it.
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>
      )}

      <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h3 className="text-sm font-semibold text-gray-900">Company details</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Shown on reports and receipts generated for this property
          </p>
        </div>
        <div className="space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Company name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                disabled={!canManage}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Workspace URL</label>
              <input type="text" value={`/${property.slug}`} disabled className={inputClass} />
              <p className="mt-1 text-xs text-gray-400">The workspace slug cannot be changed.</p>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Address</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
              disabled={!canManage}
              placeholder="Street address"
              className={inputClass}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">City</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => update('city', e.target.value)}
                disabled={!canManage}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Country</label>
              <input
                type="text"
                value={form.country}
                onChange={(e) => update('country', e.target.value)}
                disabled={!canManage}
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Contact email</label>
              <input
                type="email"
                value={form.contact_email}
                onChange={(e) => update('contact_email', e.target.value)}
                disabled={!canManage}
                placeholder="contact@company.com"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Contact phone</label>
              <input
                type="tel"
                value={form.contact_phone}
                onChange={(e) => update('contact_phone', e.target.value)}
                disabled={!canManage}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Website</label>
            <input
              type="url"
              value={form.website}
              onChange={(e) => update('website', e.target.value)}
              disabled={!canManage}
              placeholder="https://"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">License status</label>
            <span
              className={`inline-block rounded-full px-3 py-1 text-xs font-medium capitalize ${
                property.license_status === 'active'
                  ? 'bg-green-100 text-green-700'
                  : property.license_status === 'trial'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-red-100 text-red-700'
              }`}
            >
              {property.license_status}
            </span>
            <p className="mt-1 text-xs text-gray-400">Managed by your service provider.</p>
          </div>
        </div>
        {canManage && (
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
        )}
      </form>
    </div>
  )
}
