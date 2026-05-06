import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { WorkOrder } from '@/types'
import SignOffPage from '@/components/sign-off/SignOffPage'

interface Props {
  params: Promise<{ token: string }>
}

export default async function SignOffTokenPage({ params }: Props) {
  const { token } = await params
  const supabase = await createClient()

  const { data: wo } = await supabase
    .from('work_orders')
    .select(`
      *,
      engineers(id, full_name),
      ppm_schedules(
        id, title,
        assets(
          id, name, category, location,
          buildings(id, name, sites(id, name, address, city))
        )
      ),
      checklist_items(*)
    `)
    .eq('sign_off_token', token)
    .single()

  if (!wo) notFound()

  const workOrder = wo as WorkOrder

  // Validate: not expired
  if (workOrder.sign_off_expires_at && new Date(workOrder.sign_off_expires_at) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-sm text-center">
          <p className="text-4xl mb-4">⏱</p>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Link Expired</h2>
          <p className="text-sm text-gray-500">
            This sign-off link expired. Please contact Marajo Property Management for a new link.
          </p>
        </div>
      </div>
    )
  }

  // Validate: not already signed
  if (workOrder.signed_at) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-sm text-center">
          <p className="text-4xl mb-4">✅</p>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Already Signed</h2>
          <p className="text-sm text-gray-500">
            This work order has already been signed off. No further action is required.
          </p>
        </div>
      </div>
    )
  }

  return <SignOffPage workOrder={workOrder} token={token} />
}
