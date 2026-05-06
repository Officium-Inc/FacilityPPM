import { createClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import type { PpmSchedule } from '@/types'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function SchedulesPage({ params }: Props) {
  const { slug: _slug } = await params
  const supabase = await createClient()

  const { data: schedules } = await supabase
    .from('ppm_schedules')
    .select('*, assets(id, name, buildings(id, name, sites(id, name)))')
    .order('next_due', { ascending: true })

  const rows = (schedules as PpmSchedule[]) ?? []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">PPM Schedules</h2>
        <p className="text-sm text-gray-500 mt-0.5">{rows.filter((s) => s.is_active).length} active</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Title', 'Asset', 'Site', 'Frequency', 'Next Due', 'Priority', 'Active'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-gray-400">
                    No schedules found.
                  </td>
                </tr>
              ) : (
                rows.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{s.title}</td>
                    <td className="px-5 py-3 text-gray-600">{s.assets?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{s.assets?.buildings?.sites?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-600 capitalize">{s.frequency ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-600">
                      {s.next_due ? format(new Date(s.next_due), 'dd MMM yyyy') : '—'}
                    </td>
                    <td className="px-5 py-3 capitalize text-gray-600">{s.priority}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {s.is_active ? 'Yes' : 'No'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
