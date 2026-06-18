import LoadingState from '@/components/layout/LoadingState'

export default function DashboardLoading() {
  return (
    <LoadingState
      title="Loading dashboard"
      message="Fetching the latest property data..."
      className="min-h-[calc(100dvh-7rem)]"
    />
  )
}
