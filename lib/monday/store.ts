import { createServiceClient } from '@/lib/supabase/server'
import { decryptMondayToken } from '@/lib/monday/crypto'
import type { PropertyMondayIntegrationRow } from '@/lib/monday/config'
import type { MondayFieldMapping } from '@/lib/monday/fields'

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

export interface MondayIntegrationSummary {
  connected: boolean
  enabled: boolean
  tokenLast4: string | null
  apiVersion: string | null
  boardId: string | null
  boardName: string | null
  billedGroupId: string | null
  waivedGroupId: string | null
  fieldMappings: MondayFieldMapping[]
  validationStatus: string
  validationError: string | null
  updatedAt: string | null
}

export interface StoredMondayToken {
  token: string
  apiVersion: string
  row: PropertyMondayIntegrationRow
}

const INTEGRATION_COLUMNS = `
  property_id, enabled, encrypted_api_token, token_last4, api_version,
  board_id, board_name, billed_group_id, waived_group_id,
  field_mappings, validation_status, validation_error, updated_at
`

export function asMondayFieldMappings(value: unknown): MondayFieldMapping[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      fieldId: typeof item.fieldId === 'string' ? item.fieldId : '',
      columnId: typeof item.columnId === 'string' ? item.columnId : '',
      columnTitle: typeof item.columnTitle === 'string' ? item.columnTitle : undefined,
      columnType: typeof item.columnType === 'string' ? item.columnType : undefined,
    }))
    .filter((item) => item.fieldId && item.columnId && item.fieldId !== 'wo_number')
}

export async function getMondayIntegrationRow(service: ServiceClient, propertyId: string) {
  const { data, error } = await service
    .from('property_monday_integrations')
    .select(INTEGRATION_COLUMNS)
    .eq('property_id', propertyId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as PropertyMondayIntegrationRow | null
}

export function summarizeMondayIntegration(row: PropertyMondayIntegrationRow | null): MondayIntegrationSummary {
  return {
    connected: Boolean(row?.encrypted_api_token),
    enabled: row?.enabled ?? false,
    tokenLast4: row?.token_last4 ?? null,
    apiVersion: row?.api_version ?? null,
    boardId: row?.board_id ?? null,
    boardName: row?.board_name ?? null,
    billedGroupId: row?.billed_group_id ?? null,
    waivedGroupId: row?.waived_group_id ?? null,
    fieldMappings: asMondayFieldMappings(row?.field_mappings),
    validationStatus: row?.validation_status ?? 'not_configured',
    validationError: row?.validation_error ?? null,
    updatedAt: row?.updated_at ?? null,
  }
}

export async function getStoredMondayToken(service: ServiceClient, propertyId: string): Promise<StoredMondayToken> {
  const row = await getMondayIntegrationRow(service, propertyId)
  if (!row?.encrypted_api_token) {
    throw new Error('Monday API key is not connected for this property.')
  }

  return {
    token: decryptMondayToken(row.encrypted_api_token),
    apiVersion: row.api_version || '2026-04',
    row,
  }
}

export async function clearMondayTrackingForProperty(
  service: ServiceClient,
  propertyId: string,
  options: { clearItems?: boolean; clearFiles?: boolean } = {}
) {
  const clearItems = options.clearItems ?? false
  const clearFiles = options.clearFiles ?? true

  const values: Record<string, unknown> = {
    monday_sync_status: 'pending',
    monday_sync_error: null,
  }

  if (clearItems) {
    values.monday_item_id = null
    values.monday_item_url = null
    values.monday_synced_at = null
  }

  if (clearFiles) values.monday_file_assets = {}

  const { error } = await service
    .from('work_orders')
    .update(values)
    .eq('property_id', propertyId)

  if (error) throw new Error(error.message)
}
