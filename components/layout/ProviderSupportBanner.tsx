import Link from 'next/link'
import { Eye } from 'lucide-react'

/** Shown when a provider opens a property's Admin Portal: read-only support view (decision D2). */
export default function ProviderSupportBanner({ propertyName, propertySlug }: { propertyName: string; propertySlug: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
      <Eye className="h-3.5 w-3.5 shrink-0" />
      <span>
        Support view of <strong>{propertyName}</strong>: read-only. Make changes from the Provider Dashboard.
      </span>
      <Link href={`/provider/properties/${propertySlug}`} className="font-medium underline hover:text-amber-900">
        Open in Provider Dashboard
      </Link>
    </div>
  )
}
