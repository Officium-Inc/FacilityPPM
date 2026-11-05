import LoadingState from '@/components/layout/LoadingState'

export default function WorkOrdersLoading() {
  return (
    <LoadingState
      title="Loading work orders"
      message="Fetching current jobs and workflow status..."
      className="min-h-[calc(100dvh-7rem)]"
    />
  )
}
