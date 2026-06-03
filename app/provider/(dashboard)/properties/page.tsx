import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import LicenseBadge from '@/components/provider/LicenseBadge'
import type { Property } from '@/types'
import { Plus, ExternalLink } from 'lucide-react'

export default async function PropertiesPage() {
  const supabase = await createClient()

  const { data: properties } = await supabase
    .from('properties')
    .select('*')
    .order('created_at', { ascending: false })

  const rows = (properties as Property[]) ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Control Panel</h2>
          <p className="text-sm text-gray-500 mt-0.5">{rows.length} registered</p>
        </div>
        <Link
          href="/provider/properties/new"
          className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Property
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Property', 'Slug / URL', 'License', 'Created', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-gray-400">
                    No properties yet. Add your first one.
                  </td>
                </tr>
              ) : (
                rows.map((prop) => (
                  <tr key={prop.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900">{prop.name}</td>
                    <td className="px-5 py-3 text-gray-600">
                      <div className="flex items-center gap-2">
                        <code className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-xs">
                          /{prop.slug}
                        </code>
                        <a
                          href={`/${prop.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-700"
                          title="Open property dashboard"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <LicenseBadge status={prop.license_status} />
                    </td>
                    <td className="px-5 py-3 text-gray-500">
                      {new Date(prop.created_at).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-5 py-3">
                      <Link
                        href={`/provider/properties/${prop.slug}`}
                        className="text-blue-600 hover:underline text-sm font-medium"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
