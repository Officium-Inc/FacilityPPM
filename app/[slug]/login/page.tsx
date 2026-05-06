import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import LoginForm from './LoginForm'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function PropertyLoginPage({ params }: Props) {
  const { slug } = await params

  const supabase = await createServiceClient()
  const { data: property } = await supabase
    .from('properties')
    .select('id, name, slug, license_status')
    .eq('slug', slug)
    .single()

  if (!property) notFound()

  // Show a non-looping suspended notice directly on the login page
  if (property.license_status === 'suspended') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-6">
            <span className="text-red-600 text-2xl font-bold">!</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Suspended</h1>
          <p className="text-gray-500 mb-2">
            {property.name}&apos;s FacilityPPM license has been suspended.
          </p>
          <p className="text-sm text-gray-400 mb-8">
            Please contact Marajo Property Management to restore access.
          </p>
          <a
            href="mailto:support@marajo.com.ph"
            className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            Contact Support
          </a>
        </div>
      </div>
    )
  }

  return <LoginForm slug={slug} propertyName={property.name} />
}
