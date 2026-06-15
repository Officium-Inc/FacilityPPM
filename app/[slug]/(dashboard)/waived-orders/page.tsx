import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import WaivedOrdersClient from './WaivedOrdersClient'
import type { WorkOrder } from '@/types'

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

  const service = await createServiceClient()

  // Only mirror work orders where the tenant has approved the cost (costing_approved_at is set)
  const { data: workOrders } = await service
    .from('work_orders')
    .select('id, wo_number, status, priority, type, created_at, is_cost_waived, cost_waived_at, cost_waived_by_name, cost_waived_reason, engineers!work_orders_engineer_id_fkey(full_name)')
    .eq('property_id', propertyId ?? '')
    .not('costing_approved_at', 'is', null)
    .order('created_at', { ascending: false })

  const wos = (workOrders ?? []) as unknown as Array<WorkOrder & { engineers: { full_name: string } | null }>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Waived Orders</h2>
        <p className="text-sm text-gray-500 mt-0.5">Work orders with tenant-approved costs — Property Manager can waive associated costs</p>
      </div>
      <WaivedOrdersClient workOrders={wos} slug={slug} />
    </div>
  )
}
