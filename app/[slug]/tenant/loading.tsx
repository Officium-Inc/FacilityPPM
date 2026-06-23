import LoadingState from '@/components/layout/LoadingState'

export default function TenantLoading() {
  return (
    <LoadingState
      title="Loading tenant portal"
      message="Preparing your tenant workspace..."
      className="min-h-[calc(100dvh-7rem)]"
    />
  )
}
