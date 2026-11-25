import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import LicenseBadge from '@/components/provider/LicenseBadge'
import { propertyTypeLabel } from '@/lib/property-types'
import type { OrgPropertyRow } from '@/lib/org/overview'

interface Props {
  properties: OrgPropertyRow[]
  /** `provider`: links to the Platform Admin property page; `portal`: opens the property's Admin Portal. */
  variant: 'provider' | 'portal'
  emptyText?: string
}

/** The properties of an organization with their license, members and a "no administrator" warning. */
export default function OrgPropertiesTable({ properties, variant, emptyText = 'No properties yet.' }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['Property', 'Type', 'License', 'Members', 'Open WOs', ''].map((heading) => (
                <th key={heading} className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {properties.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-gray-400">{emptyText}</td>
              </tr>
            ) : (
              properties.map((property) => (
                <tr key={property.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <div className="font-medium text-gray-900">{property.name}</div>
                    <code className="text-xs text-gray-400">/{property.slug}</code>
                    {property.activeAdministrators === 0 && (
                      <div className="mt-1 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                        <AlertTriangle className="h-3 w-3" />
                        No administrator
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-600">{propertyTypeLabel(property.property_type)}</td>
                  <td className="px-5 py-3"><LicenseBadge status={property.terminated ? 'terminated' : property.license} /></td>
                  <td className="px-5 py-3 text-gray-600">{property.activeMembers}</td>
                  <td className="px-5 py-3 text-gray-600">{property.openWorkOrders}</td>
                  <td className="px-5 py-3 text-right">
                    {variant === 'provider' ? (
                      <Link href={`/provider/properties/${property.slug}`} className="text-sm font-medium text-blue-600 hover:underline">
                        Manage
                      </Link>
                    ) : (
                      <a href={`/${property.slug}`} className="text-sm font-medium text-blue-600 hover:underline">
                        Open
                      </a>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
