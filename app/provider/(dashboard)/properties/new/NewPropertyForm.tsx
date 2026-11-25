'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { slugify } from '@/lib/reserved-slugs'
import { PROPERTY_TYPE_DESCRIPTIONS, PROPERTY_TYPE_LABELS, PROPERTY_TYPES, type PropertyType } from '@/lib/property-types'
import { cn } from '@/lib/utils'

const INPUT = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

interface OrganizationOption {
  id: string
  slug: string
  name: string
}

interface Props {
  organizations: OrganizationOption[]
  initialOrganizationId: string
}

export default function NewPropertyForm({ organizations, initialOrganizationId }: Props) {
  const router = useRouter()
  const [organizationId, setOrganizationId] = useState(initialOrganizationId)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [propertyType, setPropertyType] = useState<PropertyType>('commercial')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const organization = organizations.find((org) => org.id === organizationId)
  const backHref = organization ? `/provider/organizations/${organization.slug}` : '/provider/properties'

  function handleNameChange(value: string) {
    setName(value)
    if (!slugEdited) setSlug(slugify(value))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/provider/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: organizationId, name, slug, property_type: propertyType }),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error ?? 'Failed to create the property.')
      setLoading(false)
      return
    }

    router.push(`/provider/properties/${data.property?.slug ?? slug}`)
  }

  return (
    <div className="max-w-lg space-y-6">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-3.5 h-3.5" />
        {organization ? `Back to ${organization.name}` : 'Back to Properties'}
      </Link>

      <div>
        <h2 className="text-xl font-bold text-gray-900">Add Property</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          The property uses its organization&apos;s license, and every organization administrator becomes its Administrator.
        </p>
      </div>

      {organizations.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Create an organization first: every property belongs to one.{' '}
          <Link href="/provider/organizations/new" className="font-medium underline">Create Organization</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Organization</label>
              <select required value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} className={INPUT}>
                <option value="" disabled>Select an organization…</option>
                {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Property name</label>
              <input
                type="text"
                required
                maxLength={120}
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="BGC Tower 3"
                className={INPUT}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL slug</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">facility.ppm/</span>
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => {
                    setSlugEdited(true)
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                  }}
                  placeholder="bgc-tower-3"
                  pattern="[a-z0-9\-]+"
                  title="Lowercase letters, numbers, and hyphens only"
                  className={`${INPUT} flex-1 font-mono`}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Lowercase letters, numbers, and hyphens only. Cannot be changed later.</p>
            </div>
          </div>

          <fieldset className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
            <legend className="sr-only">Property type</legend>
            <h3 className="text-sm font-semibold text-gray-900">Property type</h3>
            <div className="grid gap-2">
              {PROPERTY_TYPES.map((type) => (
                <label
                  key={type}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                    propertyType === type ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                  )}
                >
                  <input
                    type="radio"
                    name="property_type"
                    value={type}
                    checked={propertyType === type}
                    onChange={() => setPropertyType(type)}
                    className="mt-0.5 text-blue-600"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">{PROPERTY_TYPE_LABELS[type]}</span>
                    <span className="block text-xs text-gray-500">{PROPERTY_TYPE_DESCRIPTIONS[type]}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-400">Floors and units are set up by the property&apos;s Administrators.</p>
          </fieldset>

          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}

          <button
            type="submit"
            disabled={loading || !organizationId}
            className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
          >
            {loading ? 'Creating…' : 'Create Property'}
          </button>
        </form>
      )}
    </div>
  )
}
