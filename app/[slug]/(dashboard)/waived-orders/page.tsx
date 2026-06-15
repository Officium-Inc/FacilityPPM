import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Ban } from 'lucide-react'

interface Props {
  params: Promise<{ slug: string }>
}

const ALLOWED_ROLES = ['admin', 'property_manager']

export default async function WaivedOrdersPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const propertyId = user?.app_metadata?.property_id as string | undefined

  // Gate: only admin and property_manager
  let userRole = 'viewer'
  if (user?.app_metadata?.role === 'provider') {
    userRole = 'admin'
  } else if (user && propertyId) {
    const service = await createServiceClient()
    const { data: eng } = await service
      .from('engineers')
      .select('roles(name)')
      .eq('property_id', propertyId)
      .eq('user_id', user.id)
      .maybeSingle()
    const roleData = (eng?.roles as unknown as { name: string } | null)
    userRole = roleData?.name ?? 'viewer'
  }

  if (!ALLOWED_ROLES.includes(userRole)) {
    redirect(`/${slug}`)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Waived Orders</h2>
        <p className="text-sm text-gray-500 mt-0.5">Cost-waived work orders managed by Property Manager</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-100 mb-4">
          <Ban className="w-7 h-7 text-amber-600" />
        </div>
        <h3 className="text-base font-semibold text-gray-900 mb-2">Under Development</h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          The Waived Orders module is coming soon. Property Managers will be able to select
          work orders and waive associated costs, subject to approval workflow.
        </p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
          <Ban className="w-3 h-3" />
          Coming Soon
        </span>
      </div>
    </div>
  )
}
