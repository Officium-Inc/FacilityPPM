import LoadingState from '@/components/layout/LoadingState'

export default function SchedulesLoading() {
  return (
    <LoadingState
      title="Loading schedules"
      message="Preparing planned maintenance dates..."
      className="min-h-[calc(100dvh-7rem)]"
    />
  )
}
