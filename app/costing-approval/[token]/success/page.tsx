interface Props {
  searchParams: Promise<{ action?: string }>
}

export default async function CostingApprovalSuccessPage({ searchParams }: Props) {
  const { action } = await searchParams
  const approved = action !== 'reject'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-sm w-full text-center">
        <p className="text-5xl mb-4">{approved ? '✅' : '🔄'}</p>
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          {approved ? 'Cost Estimate Approved' : 'Estimate Rejected'}
        </h2>
        <p className="text-sm text-gray-500">
          {approved
            ? 'Thank you. The work has been authorised and will be assigned to an engineer.'
            : 'Your rejection has been recorded. The engineer will revise the estimate and contact you shortly.'}
        </p>
      </div>
    </div>
  )
}
