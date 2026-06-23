import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function TenantServiceRequestsIndex({ params }: Props) {
  const { slug } = await params
  redirect(`/${slug}/tenant/service-requests/my-requests`)
}
