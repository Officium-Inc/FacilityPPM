import LoadingState from '@/components/layout/LoadingState'

export default function AssetsLoading() {
  return (
    <LoadingState
      title="Loading assets"
      message="Preparing equipment and location records..."
      className="min-h-[calc(100dvh-7rem)]"
    />
  )
}
