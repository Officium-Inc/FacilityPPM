import LoadingState from '@/components/layout/LoadingState'

export default function TenantRequestFormsLoading() {
  return (
    <LoadingState
      title="Loading request forms"
      message="Preparing tenant request forms..."
      className="min-h-[calc(100dvh-7rem)]"
    />
  )
}
