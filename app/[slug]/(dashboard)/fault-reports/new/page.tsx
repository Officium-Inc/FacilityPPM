import FaultReportForm from './FaultReportForm'
import { requirePage } from '@/lib/authz/guard'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function NewFaultReportPage({ params }: Props) {
  const { slug } = await params
  await requirePage(slug, 'workRequest.submitOnBehalf')

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">New Service Report</h2>
        <p className="text-sm text-gray-500 mt-1">
          Submit a service report to initiate the maintenance approval workflow.
        </p>
      </div>
      <FaultReportForm slug={slug} />
    </div>
  )
}
