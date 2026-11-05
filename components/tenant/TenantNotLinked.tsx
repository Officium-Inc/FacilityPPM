import { Building2 } from 'lucide-react'

/** Shown to tenant members not linked to a company yet (decision D19). */
export default function TenantNotLinked({ propertyName }: { propertyName: string }) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-gray-200 bg-white p-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
        <Building2 className="h-6 w-6" />
      </div>
      <h2 className="text-base font-semibold text-gray-900">Your account isn&apos;t linked to a company yet</h2>
      <p className="mt-2 text-sm text-gray-500">
        Work requests are shared within your company. Ask the {propertyName} property administrator to link
        your account to your company, then refresh this page.
      </p>
    </div>
  )
}
