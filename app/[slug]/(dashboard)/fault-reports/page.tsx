import { createClient, createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, AlertTriangle } from 'lucide-react'
import { formatPHT } from '@/lib/utils'
import StatusBadge from '@/components/work-orders/StatusBadge'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function ServiceRequestsPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const propertyId = user?.app_metadata?.property_id as string | undefined

  const service = await createServiceClient()

  // Query reactive work orders directly, embed fault reports as children
  const { data: reactiveWOs } = await service
    .from('work_orders')
    .select(`
      id,
      wo_number,
      status,
      priority,
      created_at,
      work_order_reports!work_order_reports_work_order_id_fkey(
        id, fault_description, location_notes, reported_by_name, urgency, created_at
      )
    `)
    .eq('property_id', propertyId ?? '')
    .eq('type', 'reactive')
    .order('created_at', { ascending: false })

  type ReportRow = {
    id: string
    fault_description: string
    location_notes: string | null
    reported_by_name: string
    urgency: string
    created_at: string
  }
  type WoRow = {
    id: string
    wo_number: string
    status: string
    priority: string
    created_at: string
    work_order_reports: ReportRow[]
  }

  const rows = (reactiveWOs ?? []) as unknown as WoRow[]

  const urgencyColour: Record<string, string> = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Service Requests</h2>
          <p className="text-sm text-gray-500 mt-0.5">{rows.length} submitted</p>
        </div>
        <Link
          href={`/${slug}/fault-reports/new`}
          className="inline-flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Service Request
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <AlertTriangle className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No service requests submitted yet.</p>
          <Link
            href={`/${slug}/fault-reports/new`}
            className="mt-4 inline-flex items-center gap-2 text-sm text-green-700 hover:underline"
          >
            <Plus className="w-4 h-4" /> Submit your first request
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['WO #', 'Description', 'Location', 'Reported By', 'Urgency', 'Status', 'Submitted'].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((wo) => {
                  const r = wo.work_order_reports?.[0]
                  return (
                    <tr key={wo.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <Link
                          href={`/${slug}/work-orders/${wo.id}`}
                          className="font-medium text-green-700 hover:underline"
                        >
                          {wo.wo_number}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-gray-700 max-w-xs truncate">{r?.fault_description ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-600">{r?.location_notes ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-600">{r?.reported_by_name ?? '—'}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${urgencyColour[r?.urgency ?? ''] ?? 'bg-gray-100 text-gray-600'}`}>
                          {r?.urgency ?? '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={wo.status as Parameters<typeof StatusBadge>[0]['status']} />
                      </td>
                      <td className="px-5 py-3 text-gray-500">
                        {formatPHT(wo.created_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
