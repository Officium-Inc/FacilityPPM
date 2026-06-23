import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function RequestFormsIndex({ params }: Props) {
  const { slug } = await params
  redirect(`/${slug}/tenant/request-forms/work-permit`)
}
