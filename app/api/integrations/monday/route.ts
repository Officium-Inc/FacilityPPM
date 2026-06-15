import { NextResponse } from 'next/server'
import { requireMondayPropertyAdmin } from '@/lib/monday/auth'
import { MONDAY_FIELD_DEFINITIONS } from '@/lib/monday/fields'
import {
  clearMondayTrackingForProperty,
  getMondayIntegrationRow,
  summarizeMondayIntegration,
} from '@/lib/monday/store'

async function countByStatus(
  service: Awaited<ReturnType<typeof import('@/lib/supabase/server').createServiceClient>>,
  propertyId: string,
  status: string
) {
  const { count } = await service
    .from('work_orders')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId)
    .eq('monday_sync_status', status)

  return count ?? 0
}

export async function GET() {
  const auth = await requireMondayPropertyAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { service, propertyId } = auth.context
    const row = await getMondayIntegrationRow(service, propertyId)
    const [synced, failed, pending, skipped] = await Promise.all([
      countByStatus(service, propertyId, 'synced'),
      countByStatus(service, propertyId, 'failed'),
      countByStatus(service, propertyId, 'pending'),
      countByStatus(service, propertyId, 'skipped'),
    ])

    return NextResponse.json({
      integration: summarizeMondayIntegration(row),
      fields: MONDAY_FIELD_DEFINITIONS,
      sync: { synced, failed, pending, skipped },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load Monday integration.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE() {
  const auth = await requireMondayPropertyAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { service, propertyId, user } = auth.context
    const { error } = await service
      .from('property_monday_integrations')
      .upsert({
        property_id: propertyId,
        enabled: false,
        encrypted_api_token: null,
        token_last4: null,
        board_id: null,
        board_name: null,
        billed_group_id: null,
        waived_group_id: null,
        field_mappings: [],
        validation_status: 'not_configured',
        validation_error: null,
        updated_by_user_id: user.id,
      }, { onConflict: 'property_id' })

    if (error) throw new Error(error.message)
    await clearMondayTrackingForProperty(service, propertyId, { clearItems: true, clearFiles: true })

    return NextResponse.json({
      integration: summarizeMondayIntegration(null),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to disconnect Monday integration.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
