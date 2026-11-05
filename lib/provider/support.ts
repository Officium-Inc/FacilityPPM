import type { SupabaseClient } from '@supabase/supabase-js'

const SUPPORT_VIEW_WINDOW_MS = 30 * 60 * 1000

/**
 * Records that a provider opened a property's Admin Portal in read-only support mode (D2), at most once per
 * provider and property every 30 minutes. Never throws: logging must not block the support view.
 */
export async function recordSupportView(service: SupabaseClient, providerUserId: string, propertyId: string) {
  try {
    const since = new Date(Date.now() - SUPPORT_VIEW_WINDOW_MS).toISOString()
    const { data: recent } = await service
      .from('audit_log')
      .select('id')
      .eq('property_id', propertyId)
      .eq('user_id', providerUserId)
      .eq('action', 'support.viewed')
      .gte('created_at', since)
      .limit(1)
      .maybeSingle()
    if (recent) return

    await service.from('audit_log').insert({
      property_id: propertyId,
      user_id: providerUserId,
      action: 'support.viewed',
      entity_type: 'property',
      entity_id: propertyId,
      metadata: { actor_role: 'provider' },
    })
  } catch (error) {
    console.error('[provider] failed to record support view:', error)
  }
}
