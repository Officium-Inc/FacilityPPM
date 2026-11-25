import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'

interface Props {
  params: Promise<{ orgSlug: string }>
}

/** Public notice for a suspended or expired organization (the org portal redirects here). */
export default async function OrgSuspendedPage({ params }: Props) {
  const { orgSlug } = await params
  const service = await createServiceClient()
  const { data } = await service.from('organizations').select('name').eq('slug', orgSlug).maybeSingle()
  const name = (data?.name as string | undefined) ?? 'This organization'

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md text-center">
        <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-red-100">
          <span className="text-2xl font-bold text-red-600">!</span>
        </div>
        <h1 className="mb-2 text-xl font-bold text-gray-900">{name} is suspended</h1>
        <p className="text-sm text-gray-500">
          The organization&apos;s license is suspended or has expired, so its properties cannot be used. Contact Tenant360 to renew it.
        </p>
        <a href="/api/auth/sign-out?next=/login" className="mt-6 inline-block text-sm text-blue-600 hover:underline">
          Sign out
        </a>
        <span className="mx-2 text-gray-300">·</span>
        <Link href="/login" className="mt-6 inline-block text-sm text-blue-600 hover:underline">
          Go to login
        </Link>
      </div>
    </div>
  )
}
