'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

interface PropertyOption {
  id: string
  name: string
  slug: string
}

interface Props {
  propertyName: string
  slug: string
  isLoggedIn: boolean
  otherProperties: PropertyOption[]
}

export default function SuspendedClient({ propertyName, slug, isLoggedIn, otherProperties }: Props) {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push(`/${slug}/login`)
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-6">
          <span className="text-red-600 text-2xl font-bold">!</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Suspended</h1>
        <p className="text-gray-500 mb-2">
          {propertyName}&apos;s Tenant360 license has been suspended.
        </p>
        <p className="text-sm text-gray-400 mb-8">
          Please contact Tenant360 to restore access.
        </p>

        <a
          href="mailto:support@tenant360.com"
          className="inline-flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          Contact Support
        </a>

        {/* Other accessible properties */}
        {otherProperties.length > 0 && (
          <div className="mt-8 border-t border-gray-200 pt-6">
            <p className="text-sm text-gray-500 mb-3">Switch to another property:</p>
            <div className="flex flex-col gap-2">
              {otherProperties.map((p) => (
                <Link
                  key={p.id}
                  href={`/${p.slug}`}
                  className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {p.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Sign out option */}
        {isLoggedIn && (
          <div className="mt-6">
            <button
              onClick={handleSignOut}
              className="text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
