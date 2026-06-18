import LoadingState from '@/components/layout/LoadingState'

export default function SettingsLoading() {
  return (
    <LoadingState
      title="Loading settings"
      message="Preparing members and integrations..."
      className="min-h-[calc(100dvh-7rem)]"
    />
  )
}
