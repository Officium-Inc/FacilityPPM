import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import type { WorkOrder } from '@/types'
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
      checklist_items(*)
    `)
    .eq('sign_off_token', token)
    .single()

  if (!wo) notFound()

  const workOrder = wo as WorkOrder

  // Fetch completion evidence + fault report separately to avoid FK-hint ambiguity
  const [{ data: evidenceRows }, { data: reportRows }] = await Promise.all([
    supabase
      .from('work_order_completion_evidence')
      .select('work_description, completion_photo_urls, supporting_doc_urls')
      .eq('work_order_id', workOrder.id)
      .limit(1),
    supabase
      .from('work_order_reports')
      .select('fault_description, scope_of_work, photo_urls, inspection_photo_urls')
      .eq('work_order_id', workOrder.id)
      .limit(1),
  ])

  const ev   = (evidenceRows ?? [])[0] as { work_description?: string; completion_photo_urls?: string[]; supporting_doc_urls?: string[] } | undefined
  const rep  = (reportRows  ?? [])[0] as { fault_description?: string; scope_of_work?: string; photo_urls?: string[]; inspection_photo_urls?: string[] } | undefined

  // Collate description: best available source
  const workDescription =
    ev?.work_description ||
    rep?.scope_of_work ||
    rep?.fault_description ||
    null

  // Collate ALL photos from every stage of the workflow
  const checklist = (workOrder.checklist_items ?? []) as Array<{ photo_urls?: string[] }>
  const allPhotos: string[] = [
    ...(rep?.photo_urls              ?? []),
    ...(rep?.inspection_photo_urls   ?? []),
    ...(ev?.completion_photo_urls    ?? []),
    ...checklist.flatMap((item) => item.photo_urls ?? []),
  ].filter(Boolean)

  const allDocs: string[] = (ev?.supporting_doc_urls ?? []).filter(Boolean)

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

  return <SignOffPage workOrder={workOrder} workDescription={workDescription} allPhotos={allPhotos} allDocs={allDocs} token={token} />
}
