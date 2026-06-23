import ServiceRequestsView from '../ServiceRequestsView'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function RequestsForApprovalPage({ params }: Props) {
  const { slug } = await params
  return <ServiceRequestsView slug={slug} filter="for-my-approval" />
}
