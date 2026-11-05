import { createServiceClient } from '@/lib/supabase/server'
import { hashToken, isPlausibleToken } from '@/lib/token'
import { withSignedFileUrls } from '@/lib/storage-files'
import { notFound } from 'next/navigation'
import type { WorkOrder } from '@/types'
import SignOffPage from '@/components/sign-off/SignOffPage'
import {
  SIGN_OFF_VIEW_SELECT,
  loadSignOffEvidence,
  signOffDecisionBlocker,
  type SignOffDecisionRecord,
} from '@/lib/approval-rules'

interface Props {
  params: Promise<{ token: string }>
}

export default async function SignOffTokenPage({ params }: Props) {
  const { token } = await params
  if (!isPlausibleToken(token)) notFound()
  // Use service client so joined tables (assets, sites, etc.) bypass RLS for this public page
  const supabase = await createServiceClient()

  const { data: wo } = await supabase
    .from('work_orders')
    .select(SIGN_OFF_VIEW_SELECT)
    .eq('sign_off_token_hash', hashToken(token))
    .maybeSingle()

  if (!wo) notFound()

  const workOrder = wo as WorkOrder
  const blocked = signOffDecisionBlocker(workOrder as unknown as SignOffDecisionRecord, true)
  if (blocked && !blocked.ok) {
    const expired = blocked.status === 410
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-sm text-center">
          <p className="text-4xl mb-4">{expired ? '⏱' : '✅'}</p>
          <h2 className="text-xl font-bold text-gray-900 mb-2">{expired ? 'Link Unavailable' : 'No Action Needed'}</h2>
          <p className="text-sm text-gray-500">
            {blocked.error} {expired ? 'Please contact Tenant360 for a new link.' : ''}
          </p>
        </div>
      </div>
    )
  }

  // No signed-in user here: the token holder sees the files through short-lived signed URLs
  const { order, workDescription, allPhotos, allDocs } = await withSignedFileUrls(supabase, {
    ...(await loadSignOffEvidence(supabase, workOrder)),
    order: { ...workOrder, sign_off_token_hash: null, costing_token_hash: null } as WorkOrder,
  })
  const base = `/sign-off/${encodeURIComponent(token)}`

  return (
    <SignOffPage
      workOrder={order}
      workDescription={workDescription}
      allPhotos={allPhotos}
      allDocs={allDocs}
      endpoint={`/api${base}`}
      successHref={`${base}/success`}
      rejectedHref={`${base}/rejected`}
    />
  )
}