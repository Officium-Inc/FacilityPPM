import { decryptMondayToken } from '@/lib/monday/crypto'
import type { MondayFieldMapping } from '@/lib/monday/fields'
import { asMondayFieldMappings } from '@/lib/monday/store'

export const DEFAULT_MONDAY_API_VERSION = process.env.MONDAY_API_VERSION || '2026-04'

export interface PropertyMondayIntegrationRow {
  property_id: string
  enabled: boolean
  encrypted_api_token: string | null
  token_last4: string | null
  api_version: string | null
  board_id: string | null
  board_name: string | null
  billed_group_id: string | null
  waived_group_id: string | null
  field_mappings: unknown
  validation_status: string | null
  validation_error: string | null
  updated_at: string
}

export interface PropertyMondayConfig {
  propertyId: string
  enabled: boolean
  apiToken: string
  apiVersion: string
  boardId: string
  boardName: string | null
  billedGroupId: string | null
  waivedGroupId: string | null
  fieldMappings: MondayFieldMapping[]
}

export interface PropertyMondayConfigState {
  enabled: boolean
  config: PropertyMondayConfig | null
  missing: string[]
}

export async function getPropertyMondayConfig(
  service: { from: (table: string) => unknown },
  propertyId: string | null | undefined
): Promise<PropertyMondayConfigState> {
  if (!propertyId) return { enabled: false, config: null, missing: ['property_id'] }

  const query = (service.from('property_monday_integrations') as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: PropertyMondayIntegrationRow | null; error: { message: string } | null }>
      }
    }
  })
    .select(`
      property_id, enabled, encrypted_api_token, token_last4, api_version,
      board_id, board_name, billed_group_id, waived_group_id,
      field_mappings, validation_status, validation_error, updated_at
    `)
    .eq('property_id', propertyId)

  const { data, error } = await query.maybeSingle()
  if (error || !data || !data.enabled) return { enabled: false, config: null, missing: [] }

  const missing = [
    data.encrypted_api_token ? null : 'api_token',
    data.board_id ? null : 'board_id',
  ].filter((value): value is string => Boolean(value))

  if (missing.length > 0) return { enabled: true, config: null, missing }

  return {
    enabled: true,
    missing: [],
    config: {
      propertyId,
      enabled: data.enabled,
      apiToken: decryptMondayToken(data.encrypted_api_token!),
      apiVersion: data.api_version || DEFAULT_MONDAY_API_VERSION,
      boardId: data.board_id!,
      boardName: data.board_name,
      billedGroupId: data.billed_group_id,
      waivedGroupId: data.waived_group_id,
      fieldMappings: asMondayFieldMappings(data.field_mappings),
    },
  }
}
