import { createServiceClient } from '@/lib/supabase/server'
import { syncTenant360WorkOrder } from '@/lib/monday/tenant360'

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

export interface MondayBackfillResult {
  count: number
  results: Array<{ workOrderId: string; status: string; itemId?: string | null; error?: string }>
}

export async function syncMondayWorkOrdersForProperty(
  service: ServiceClient,
  propertyId: string,
  options: {
    workOrderIds?: string[]
    limit?: number
    includeSynced?: boolean
  } = {}
): Promise<MondayBackfillResult> {
  let workOrderIds = options.workOrderIds?.filter(Boolean) ?? []

  if (workOrderIds.length > 0) {
    const { data, error } = await service
      .from('work_orders')
      .select('id')
      .eq('property_id', propertyId)
      .in('id', workOrderIds)

    if (error) throw new Error(error.message)
    const allowed = new Set((data ?? []).map((row) => row.id as string))
    workOrderIds = workOrderIds.filter((id) => allowed.has(id))
  } else {
    const limit = Math.max(1, Math.min(Number(options.limit) || 50, 100))
    let query = service
      .from('work_orders')
      .select('id')
      .eq('property_id', propertyId)
      .or('costing_approved_at.not.is.null,is_cost_waived.eq.true')
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (!options.includeSynced) query = query.neq('monday_sync_status', 'synced')

    const { data, error } = await query
    if (error) throw new Error(error.message)
    workOrderIds = (data ?? []).map((row) => row.id as string)
  }

  const results: MondayBackfillResult['results'] = []
  for (const workOrderId of workOrderIds) {
    const result = await syncTenant360WorkOrder(workOrderId, { findExisting: true })
    results.push({
      workOrderId,
      status: result.status,
      itemId: result.itemId,
      error: result.error,
    })
  }

  return { count: results.length, results }
}
