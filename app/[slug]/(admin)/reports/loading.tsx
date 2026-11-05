import LoadingState from '@/components/layout/LoadingState'

export default function ReportsLoading() {
  return (
    <LoadingState
      title="Loading reports"
      message="Compiling performance and activity data..."
      className="min-h-[calc(100dvh-7rem)]"
    />
  )
}
