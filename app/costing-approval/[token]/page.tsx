import { notFound } from 'next/navigation'
import CostingApprovalPage from '@/components/work-orders/CostingApprovalPage'
import type { WorkOrderCosting } from '@/types'

interface Props {
  params: Promise<{ token: string }>
}

export default async function CostingApprovalTokenPage({ params }: Props) {
  const { token } = await params

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const res = await fetch(`${appUrl}/api/costing-approval/${token}`, {
    cache: 'no-store',
  })

  if (res.status === 404) notFound()

  if (res.status === 410) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-sm text-center">
          <p className="text-4xl mb-4">⏱</p>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Link Expired</h2>
          <p className="text-sm text-gray-500">
            This cost approval link has expired. Please contact Tenant360
            for a new link.
          </p>
        </div>
      </div>
    )
  }

  if (res.status === 409) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-sm text-center">
          <p className="text-4xl mb-4">✅</p>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Already Reviewed</h2>
          <p className="text-sm text-gray-500">
            This cost estimate has already been reviewed. No further action is needed.
          </p>
        </div>
      </div>
    )
  }

  if (!res.ok) notFound()

  const data = await res.json()

  return (
    <CostingApprovalPage
      token={token}
      woNumber={data.wo_number}
      propertyName={data.properties?.name ?? ''}
      costing={(data.work_order_costings?.[0] ?? null) as WorkOrderCosting | null}
    />
  )
}
