import LoadingState from '@/components/layout/LoadingState'

export default function TenantServiceRequestsLoading() {
  return (
    <LoadingState
      title="Loading service requests"
      message="Fetching your requests and approvals..."
      className="min-h-[calc(100dvh-7rem)]"
    />
  )
}
