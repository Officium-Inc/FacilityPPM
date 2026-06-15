import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { WorkOrder, WorkOrderCompletionEvidence, WorkOrderReport } from '@/types'
import SignOffPage from '@/components/sign-off/SignOffPage'

interface Props {
  params: Promise<{ token: string }>
}

export default async function SignOffTokenPage({ params }: Props) {
  const { token } = await params
  // Use service client so joined tables (assets, sites, etc.) bypass RLS for this public page
  const supabase = await createServiceClient()

  const { data: wo } = await supabase
    .from('work_orders')
    .select(`
      *,
      engineers!work_orders_engineer_id_fkey(id, full_name),
      ppm_schedules(
        id, title,
        assets(
          id, name, category, location,
          buildings(id, name, sites(id, name, address, city))
        )
      ),
      checklist_items(*),
      work_order_reports(*)
    `)
    .eq('sign_off_token', token)
    .single()

  if (!wo) notFound()

  const workOrder = wo as WorkOrder
  const reports = ((wo as Record<string, unknown>).work_order_reports as WorkOrderReport[] | null) ?? []

  // Fetch completion evidence separately to avoid FK-hint ambiguity
  const { data: evidenceRows } = await supabase
    .from('work_order_completion_evidence')
    .select('*')
    .eq('work_order_id', workOrder.id)
    .limit(1)

  const evidence = (evidenceRows as WorkOrderCompletionEvidence[] | null) ?? []

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

  return <SignOffPage workOrder={workOrder} evidence={evidence} report={reports[0] ?? null} token={token} />
}
