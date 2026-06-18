import LoadingState from '@/components/layout/LoadingState'

export default function FaultReportsLoading() {
  return (
    <LoadingState
      title="Loading service requests"
      message="Checking submitted reports and priorities..."
      className="min-h-[calc(100dvh-7rem)]"
    />
  )
}
