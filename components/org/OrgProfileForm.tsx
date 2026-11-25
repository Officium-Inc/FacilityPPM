'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Save } from 'lucide-react'

export interface OrgProfileValues {
  name: string
  legal_name: string | null
  contact_email: string | null
  contact_phone: string | null
  address: string | null
  city: string | null
  country: string | null
  website: string | null
}

interface Props {
  /** PATCH endpoint: `/api/provider/organizations/<slug>` or `/api/org/<slug>`. */
  endpoint: string
  organization: OrgProfileValues
  slug: string
  canEdit: boolean
}

const FIELDS: Array<{ key: keyof OrgProfileValues; label: string; type?: string; placeholder?: string; wide?: boolean }> = [
  { key: 'name', label: 'Organization name', placeholder: 'Ayala Land Offices' },
  { key: 'legal_name', label: 'Legal name', placeholder: 'Ayala Land Offices, Inc.' },
  { key: 'contact_email', label: 'Contact email', type: 'email', placeholder: 'facilities@company.com' },
  { key: 'contact_phone', label: 'Contact phone', placeholder: '+63 2 8888 0000' },
  { key: 'address', label: 'Address', wide: true },
  { key: 'city', label: 'City' },
  { key: 'country', label: 'Country' },
  { key: 'website', label: 'Website', placeholder: 'https://company.com', wide: true },
]

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500'

/** The organization profile (name and contact details). */
export default function OrgProfileForm({ endpoint, organization, slug, canEdit }: Props) {
  const router = useRouter()
  const [values, setValues] = useState<OrgProfileValues>(organization)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const changed = FIELDS.filter(({ key }) => (values[key] ?? '') !== (organization[key] ?? ''))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (changed.length === 0) return
    setSaving(true)
    setMessage(null)
    const payload = Object.fromEntries(changed.map(({ key }) => [key, values[key] ?? '']))
    const res = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    setMessage(res.ok ? { type: 'success', text: 'Organization profile saved.' } : { type: 'error', text: data.error ?? 'Save failed.' })
    if (res.ok) router.refresh()
  }

  return (
    <form onSubmit={save} className="space-y-5 rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-900">Organization profile</h3>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.map(({ key, label, type, placeholder, wide }) => (
          <div key={key} className={wide ? 'sm:col-span-2' : undefined}>
            <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
            <input
              type={type ?? 'text'}
              value={values[key] ?? ''}
              onChange={(e) => setValues((current) => ({ ...current, [key]: e.target.value }))}
              placeholder={placeholder}
              required={key === 'name'}
              maxLength={key === 'name' ? 120 : 200}
              disabled={!canEdit}
              className={INPUT}
            />
          </div>
        ))}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">Organization slug</label>
          <input type="text" value={slug} disabled className={`${INPUT} font-mono`} />
          <p className="mt-1 text-xs text-gray-400">The slug cannot be changed.</p>
        </div>
      </div>
      {message && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${message.type === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}
      {canEdit && (
        <button
          type="submit"
          disabled={saving || changed.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800 disabled:bg-gray-200 disabled:text-gray-400"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      )}
    </form>
  )
}
