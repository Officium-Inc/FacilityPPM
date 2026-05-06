import { createClient } from '@/lib/supabase/server'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function ReportsPage({ params }: Props) {
  const { slug: _slug } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const propertyId = user?.app_metadata?.property_id as string | undefined

  const [
    { count: total },
    { count: verified },
    { count: overdue },
    { count: cancelled },
  ] = await Promise.all([
    supabase.from('work_orders').select('*', { count: 'exact', head: true }).eq('property_id', propertyId ?? ''),
    supabase.from('work_orders').select('*', { count: 'exact', head: true }).eq('property_id', propertyId ?? '').eq('status', 'verified'),
    supabase.from('work_orders').select('*', { count: 'exact', head: true }).eq('property_id', propertyId ?? '').eq('status', 'overdue'),
    supabase.from('work_orders').select('*', { count: 'exact', head: true }).eq('property_id', propertyId ?? '').eq('status', 'cancelled'),
  ])

  const completionRate = total ? Math.round(((verified ?? 0) / total) * 100) : 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Reports & Compliance</h2>
        <p className="text-sm text-gray-500 mt-0.5">Summary of all maintenance activity</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Total Work Orders', value: total ?? 0 },
          { label: 'Verified (Signed Off)', value: verified ?? 0 },
          { label: 'Overdue', value: overdue ?? 0 },
          { label: 'Cancelled', value: cancelled ?? 0 },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 text-sm mb-3">Completion Rate</h3>
        <div className="flex items-center gap-4">
          <p className="text-4xl font-bold text-green-600">{completionRate}%</p>
          <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {verified} of {total} work orders fully verified and signed off
        </p>
      </div>
    </div>
  )
}
