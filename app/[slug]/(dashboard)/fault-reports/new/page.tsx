import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import FaultReportForm from './FaultReportForm'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function NewFaultReportPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">New Fault Report</h2>
        <p className="text-sm text-gray-500 mt-1">
          Submit a fault report to initiate the maintenance approval workflow.
        </p>
      </div>
      <FaultReportForm slug={slug} />
    </div>
  )
}
