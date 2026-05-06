import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import StatusBadge from '@/components/work-orders/StatusBadge'
import ChecklistItemComponent from '@/components/work-orders/ChecklistItem'
import WorkOrderActions from '@/components/work-orders/WorkOrderActions'
import { format } from 'date-fns'
import type { WorkOrder } from '@/types'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface Props {
  params: Promise<{ slug: string; id: string }>
}

export default async function WorkOrderDetailPage({ params }: Props) {
  const { slug, id } = await params
  const supabase = await createClient()

  const { data: wo } = await supabase
    .from('work_orders')
    .select(`
      *,
      engineers(id, full_name, email, phone),
      ppm_schedules(
        id, title, frequency,
        assets(
          id, name, category, make, model, location,
          buildings(id, name, sites(id, name, address, city))
        )
      ),
      checklist_items(*)
    `)
    .eq('id', id)
    .single()

  if (!wo) notFound()

  const workOrder = wo as WorkOrder
  const asset = workOrder.ppm_schedules?.assets
  const site = asset?.buildings?.sites
  const checklist = (workOrder.checklist_items ?? []).sort(
    (a, b) => a.sort_order - b.sort_order
  )

  return (
    <div className="space-y-6 max-w-5xl">
      <Link
        href={`/${slug}/work-orders`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Work Orders
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold text-gray-900">{workOrder.wo_number}</h2>
            <StatusBadge status={workOrder.status} />
          </div>
          <p className="text-sm text-gray-500 mt-1 capitalize">
            {workOrder.type} · {workOrder.priority} priority
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 text-sm mb-4">Work Order Details</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Detail label="Property" value={site?.name ?? '—'} />
              <Detail label="Address" value={site ? `${site.address}, ${site.city}` : '—'} />
              <Detail label="Building" value={asset?.buildings?.name ?? '—'} />
              <Detail label="Asset" value={asset?.name ?? '—'} />
              <Detail label="Category" value={asset?.category ?? '—'} />
              <Detail label="Make / Model" value={asset ? `${asset.make} ${asset.model}` : '—'} />
              <Detail label="Location" value={asset?.location ?? '—'} />
              <Detail label="Schedule" value={workOrder.ppm_schedules?.title ?? '—'} />
              <Detail label="Engineer" value={workOrder.engineers?.full_name ?? 'Unassigned'} />
              <Detail
                label="Scheduled Date"
                value={
                  workOrder.scheduled_date
                    ? format(new Date(workOrder.scheduled_date), 'dd MMM yyyy')
                    : '—'
                }
              />
              {workOrder.completed_date && (
                <Detail
                  label="Completed Date"
                  value={format(new Date(workOrder.completed_date), 'dd MMM yyyy HH:mm')}
                />
              )}
              {workOrder.notes && <Detail label="Notes" value={workOrder.notes} />}
            </dl>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 text-sm mb-2">
              Checklist ({checklist.length} items)
            </h3>
            {checklist.length === 0 ? (
              <p className="text-sm text-gray-400">No checklist items.</p>
            ) : (
              <div>
                {checklist.map((item) => (
                  <ChecklistItemComponent
                    key={item.id}
                    description={item.description}
                    result={item.result}
                    remarks={item.remarks}
                    photoUrls={item.photo_urls}
                    sortOrder={item.sort_order}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <WorkOrderActions workOrder={workOrder} />
        </div>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</dt>
      <dd className="text-gray-800 mt-0.5">{value}</dd>
    </div>
  )
}
