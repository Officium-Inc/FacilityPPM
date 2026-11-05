import LoadingState from '@/components/layout/LoadingState'

export default function EngineersLoading() {
  return (
    <LoadingState
      title="Loading engineers"
      message="Preparing team member records..."
      className="min-h-[calc(100dvh-7rem)]"
    />
  )
}
