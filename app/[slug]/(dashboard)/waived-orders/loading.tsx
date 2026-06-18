import LoadingState from '@/components/layout/LoadingState'

export default function WaivedOrdersLoading() {
  return (
    <LoadingState
      title="Loading waived orders"
      message="Fetching cost-waived work order records..."
      className="min-h-[calc(100dvh-7rem)]"
    />
  )
}
