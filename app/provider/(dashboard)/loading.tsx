import LoadingState from '@/components/layout/LoadingState'

export default function ProviderDashboardLoading() {
  return (
    <LoadingState
      title="Loading control panel"
      message="Preparing provider tools..."
      tone="blue"
      className="min-h-[calc(100dvh-7rem)]"
    />
  )
}
