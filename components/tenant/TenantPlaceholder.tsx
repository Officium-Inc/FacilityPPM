import type { ReactNode } from 'react'

export default function TenantPlaceholder({
  title,
  description,
  icon,
}: {
  title: string
  description: string
  icon: ReactNode
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        <p className="mt-0.5 text-sm text-gray-500">{description}</p>
      </div>
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-700">
          {icon}
        </div>
        <h3 className="text-sm font-semibold text-gray-900">Coming soon</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
          This tenant portal section is ready in the navigation, but functionality has not been enabled yet.
        </p>
      </div>
    </div>
  )
}
