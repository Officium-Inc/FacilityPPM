import type { SupabaseClient } from '@supabase/supabase-js'
import { isLicenseStatus } from '@/lib/provider/license'
import type { LicenseStatus } from '@/types'

/** Read-only account (termination) state of properties, derived from the audit log (D18). */

export const ACCOUNT_ACTIONS = ['account.terminated', 'account.reactivated']

export interface AccountStatus {
  terminated: boolean
  /** The latest termination event, while terminated. */
  terminatedAt: string | null
  reason: string | null
  deactivatedMemberIds: string[]
  previousLicenseStatus: LicenseStatus | null
}

/** A property is terminated when its latest account event is a termination. */
export async function getAccountStatus(service: SupabaseClient, propertyId: string): Promise<AccountStatus> {
  const { data } = await service
    .from('audit_log')
    .select('action, metadata, created_at')
    .eq('property_id', propertyId)
    .in('action', ACCOUNT_ACTIONS)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data || data.action !== 'account.terminated') {
    return { terminated: false, terminatedAt: null, reason: null, deactivatedMemberIds: [], previousLicenseStatus: null }
  }
  const metadata = (data.metadata ?? {}) as Record<string, unknown>
  return {
    terminated: true,
    terminatedAt: data.created_at as string,
    reason: typeof metadata.reason === 'string' ? metadata.reason : null,
    deactivatedMemberIds: Array.isArray(metadata.deactivated_member_ids)
      ? metadata.deactivated_member_ids.filter((id): id is string => typeof id === 'string')
      : [],
    previousLicenseStatus: isLicenseStatus(metadata.previous_license_status) ? metadata.previous_license_status : null,
  }
}

/** Ids of every terminated property. */
export async function getTerminatedPropertyIds(service: SupabaseClient) {
  const { data } = await service
    .from('audit_log')
    .select('property_id, action, created_at')
    .in('action', ACCOUNT_ACTIONS)
    .not('property_id', 'is', null)
    .order('created_at', { ascending: false })

  const seen = new Set<string>()
  const terminated = new Set<string>()
  for (const row of (data ?? []) as Array<{ property_id: string; action: string }>) {
    if (seen.has(row.property_id)) continue
    seen.add(row.property_id)
    if (row.action === 'account.terminated') terminated.add(row.property_id)
  }
  return terminated
}
