import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'
import {
  DEFAULT_MONDAY_API_VERSION,
  getPropertyMondayConfig,
  type PropertyMondayConfig,
} from '@/lib/monday/config'
import { MondayClient, type MondayItemRef } from '@/lib/monday/client'
import {
  getMondayFieldDefinition,
  isColumnCompatible,
  MONDAY_FIELD_DEFINITIONS,
  type MondayFieldDefinition,
  type MondayFieldMapping,
} from '@/lib/monday/fields'

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>
type SyncStatus = 'pending' | 'synced' | 'failed' | 'skipped'

interface StoredMondayFileAsset {
  assetId: string
  name: string
  url: string
  uploadedAt: string
}

type StoredMondayFileAssets = Record<string, StoredMondayFileAsset>

interface AttachmentRef {
  key: string
  url: string
  name: string
}

interface MondayItemPage {
  cursor: string | null
  items: MondayItemRef[]
}

interface MondayBoardColumn {
  id: string
  title: string
  type: string
}

interface MondayBoardGroup {
  id: string
  title: string
}

export interface MondayBoardDetails {
  id: string
  name: string
  groups: MondayBoardGroup[]
  columns: MondayBoardColumn[]
}

interface WorkOrderSyncRow {
  id: string
  property_id: string | null
  wo_number: string
  status: string | null
  type: string | null
  priority: string | null
  scheduled_date: string | null
  due_date: string | null
  completed_date: string | null
  notes: string | null
  tenant_name: string | null
  tenant_email: string | null
  is_cost_waived: boolean | null
  cost_waived_at: string | null
  cost_waived_by_name: string | null
  cost_waived_reason: string | null
  costing_approved_at: string | null
  costing_approved_by_name: string | null
  pdf_url: string | null
  signed_at: string | null
  monday_item_id: string | null
  monday_item_url: string | null
  monday_file_assets: StoredMondayFileAssets | null
  properties?: { name?: string | null; slug?: string | null } | { name?: string | null; slug?: string | null }[] | null
  engineers?: { full_name?: string | null } | { full_name?: string | null }[] | null
  work_order_costings?: Array<{ grand_total?: number | string | null }> | null
  work_order_reports?: Array<{
    photo_urls?: string[] | null
    inspection_photo_urls?: string[] | null
  }> | null
  work_order_completion_evidence?: Array<{
    completion_photo_urls?: string[] | null
    supporting_doc_urls?: string[] | null
  }> | null
  checklist_items?: Array<{ photo_urls?: string[] | null }> | null
  ppm_schedules?: {
    assets?: {
      name?: string | null
      buildings?: {
        name?: string | null
        sites?: { name?: string | null } | { name?: string | null }[] | null
      } | {
        name?: string | null
        sites?: { name?: string | null } | { name?: string | null }[] | null
      }[] | null
    } | {
      name?: string | null
      buildings?: {
        name?: string | null
        sites?: { name?: string | null } | { name?: string | null }[] | null
      } | {
        name?: string | null
        sites?: { name?: string | null } | { name?: string | null }[] | null
      }[] | null
    }[] | null
  } | {
    assets?: {
      name?: string | null
      buildings?: {
        name?: string | null
        sites?: { name?: string | null } | { name?: string | null }[] | null
      } | {
        name?: string | null
        sites?: { name?: string | null } | { name?: string | null }[] | null
      }[] | null
    } | {
      name?: string | null
      buildings?: {
        name?: string | null
        sites?: { name?: string | null } | { name?: string | null }[] | null
      } | {
        name?: string | null
        sites?: { name?: string | null } | { name?: string | null }[] | null
      }[] | null
    }[] | null
  }[] | null
}

interface SyncResult {
  status: SyncStatus
  skipped?: boolean
  itemId?: string | null
  error?: string
}

interface FieldValue {
  value: string | number | null
  linkUrl?: string | null
}

function single<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
}

function isoDate(value: string | null | undefined) {
  if (!value) return null
  return value.slice(0, 10)
}

function fileKey(url: string) {
  return crypto.createHash('sha256').update(url).digest('hex')
}

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function sanitizeFileName(name: string) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'attachment'
}

function extensionFromContentType(contentType: string) {
  const type = contentType.split(';')[0]?.toLowerCase()
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
  }
  return map[type] ?? null
}

function extensionFromUrl(url: string) {
  const clean = url.split('?')[0] ?? ''
  const match = clean.match(/\.([a-z0-9]{2,5})$/i)
  return match?.[1]?.toLowerCase() ?? null
}

function withExtension(name: string, url: string, contentType: string) {
  const cleanName = sanitizeFileName(name)
  if (/\.[a-z0-9]{2,5}$/i.test(cleanName)) return cleanName
  const ext = extensionFromContentType(contentType) ?? extensionFromUrl(url)
  return ext ? `${cleanName}.${ext}` : cleanName
}

function attachment(url: string | null | undefined, name: string): AttachmentRef | null {
  if (!url?.trim()) return null
  const cleanUrl = url.trim()
  return { key: fileKey(cleanUrl), url: cleanUrl, name: sanitizeFileName(name) }
}

function arrayUrls(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((url): url is string => typeof url === 'string' && url.trim().length > 0) : []
}

function collectAttachments(wo: WorkOrderSyncRow): AttachmentRef[] {
  const attachments: AttachmentRef[] = []
  const baseUrl = appUrl()
  const report = wo.work_order_reports?.[0]
  const evidence = wo.work_order_completion_evidence?.[0]

  if (report) {
    arrayUrls(report.photo_urls).forEach((url, index) => {
      const item = attachment(url, `${wo.wo_number}-report-photo-${index + 1}`)
      if (item) attachments.push(item)
    })
    arrayUrls(report.inspection_photo_urls).forEach((url, index) => {
      const item = attachment(url, `${wo.wo_number}-inspection-photo-${index + 1}`)
      if (item) attachments.push(item)
    })
    if (baseUrl) {
      attachments.push({
        key: fileKey(`${baseUrl}/api/pdf/${wo.id}/report`),
        url: `${baseUrl}/api/pdf/${wo.id}/report`,
        name: `${wo.wo_number}-service-report.pdf`,
      })
    }
  }

  if (evidence) {
    arrayUrls(evidence.completion_photo_urls).forEach((url, index) => {
      const item = attachment(url, `${wo.wo_number}-completion-photo-${index + 1}`)
      if (item) attachments.push(item)
    })
    arrayUrls(evidence.supporting_doc_urls).forEach((url, index) => {
      const item = attachment(url, `${wo.wo_number}-supporting-doc-${index + 1}`)
      if (item) attachments.push(item)
    })
  }

  wo.checklist_items?.forEach((item, itemIndex) => {
    arrayUrls(item.photo_urls).forEach((url, photoIndex) => {
      const ref = attachment(url, `${wo.wo_number}-checklist-${itemIndex + 1}-photo-${photoIndex + 1}`)
      if (ref) attachments.push(ref)
    })
  })

  if (wo.work_order_costings?.length && baseUrl) {
    attachments.push({
      key: fileKey(`${baseUrl}/api/pdf/${wo.id}/costing`),
      url: `${baseUrl}/api/pdf/${wo.id}/costing`,
      name: `${wo.wo_number}-cost-estimate.pdf`,
    })
  }

  const receipt = attachment(wo.pdf_url, `${wo.wo_number}-signed-receipt.pdf`)
  if (receipt) attachments.push(receipt)

  const deduped = new Map<string, AttachmentRef>()
  attachments.forEach((item) => deduped.set(item.key, item))
  return [...deduped.values()]
}

function assetInfo(wo: WorkOrderSyncRow) {
  const schedule = single(wo.ppm_schedules)
  const asset = single(schedule?.assets)
  const building = single(asset?.buildings)
  const site = single(building?.sites)
  return { asset, building, site }
}

function fieldValue(wo: WorkOrderSyncRow, field: MondayFieldDefinition): FieldValue {
  const isWaived = wo.is_cost_waived === true
  const property = single(wo.properties)
  const engineer = single(wo.engineers)
  const costing = wo.work_order_costings?.[0]
  const { asset, building, site } = assetInfo(wo)
  const baseUrl = appUrl()
  const linkUrl = baseUrl && property?.slug ? `${baseUrl}/${property.slug}/work-orders/${wo.id}` : null

  switch (field.id) {
    case 'wo_number':
      return { value: wo.wo_number }
    case 'property':
      return { value: property?.name ?? null }
    case 'billing_status':
      return { value: isWaived ? 'Waived' : 'Billed' }
    case 'approval_or_waiver_date':
      return { value: isWaived ? wo.cost_waived_at : wo.costing_approved_at }
    case 'grand_total':
      return { value: isWaived ? 0 : Number(costing?.grand_total ?? 0) }
    case 'facilityppm_link':
      return { value: wo.wo_number, linkUrl }
    case 'workflow_status':
      return { value: wo.status }
    case 'type':
      return { value: wo.type }
    case 'priority':
      return { value: wo.priority }
    case 'engineer':
      return { value: engineer?.full_name ?? null }
    case 'asset':
      return { value: asset?.name ?? null }
    case 'building':
      return { value: building?.name ?? null }
    case 'site':
      return { value: site?.name ?? null }
    case 'scheduled_date':
      return { value: wo.scheduled_date }
    case 'due_date':
      return { value: wo.due_date }
    case 'completed_date':
      return { value: wo.completed_date }
    case 'tenant_name':
      return { value: wo.tenant_name }
    case 'tenant_email':
      return { value: wo.tenant_email }
    case 'cost_approved_by':
      return { value: wo.costing_approved_by_name }
    case 'waived_by':
      return { value: wo.cost_waived_by_name }
    case 'waiver_reason':
      return { value: wo.cost_waived_reason }
    case 'notes':
      return { value: wo.notes }
    default:
      return { value: null }
  }
}

function formatColumnValue(field: MondayFieldDefinition, mapping: MondayFieldMapping, value: FieldValue) {
  if (field.kind === 'files') return undefined
  if (value.value === null || value.value === undefined || value.value === '') return null

  const columnType = mapping.columnType
  if (columnType === 'status') return { label: String(value.value) }
  if (columnType === 'date') return isoDate(String(value.value)) ? { date: isoDate(String(value.value)) } : null
  if (columnType === 'numbers') return String(value.value)
  if (columnType === 'email') return { email: String(value.value), text: String(value.value) }
  if (columnType === 'link') {
    const url = value.linkUrl ?? String(value.value)
    return url ? { url, text: String(value.value) } : null
  }
  return String(value.value)
}

function buildColumnValues(wo: WorkOrderSyncRow, mappings: MondayFieldMapping[]) {
  const columnValues: Record<string, unknown> = {}

  for (const mapping of mappings) {
    const field = getMondayFieldDefinition(mapping.fieldId)
    if (!field || field.kind === 'files') continue
    const value = formatColumnValue(field, mapping, fieldValue(wo, field))
    if (value !== undefined) columnValues[mapping.columnId] = value
  }

  return columnValues
}

function filesMapping(mappings: MondayFieldMapping[]) {
  return mappings.find((mapping) => mapping.fieldId === 'attachments') ?? null
}

async function downloadAttachment(ref: AttachmentRef) {
  const response = await fetch(ref.url)
  if (!response.ok) {
    throw new Error(`Could not download ${ref.name} (${response.status})`)
  }

  const contentType = response.headers.get('content-type') ?? 'application/octet-stream'
  const buffer = Buffer.from(await response.arrayBuffer())
  return {
    buffer,
    contentType,
    fileName: withExtension(ref.name, ref.url, contentType),
  }
}

async function fetchWorkOrderForSync(service: ServiceClient, workOrderId: string) {
  const { data, error } = await service
    .from('work_orders')
    .select(`
      id, property_id, wo_number, status, type, priority, scheduled_date, due_date,
      completed_date, notes, tenant_name, tenant_email, is_cost_waived,
      cost_waived_at, cost_waived_by_name, cost_waived_reason,
      costing_approved_at, costing_approved_by_name, pdf_url, signed_at,
      monday_item_id, monday_item_url, monday_file_assets,
      properties(name, slug),
      engineers!work_orders_engineer_id_fkey(full_name),
      work_order_costings!work_order_costings_work_order_id_fkey(grand_total),
      work_order_reports!work_order_reports_work_order_id_fkey(photo_urls, inspection_photo_urls),
      work_order_completion_evidence!work_order_completion_evidence_work_order_id_fkey(completion_photo_urls, supporting_doc_urls),
      checklist_items(photo_urls),
      ppm_schedules(assets(name, buildings(name, sites(name))))
    `)
    .eq('id', workOrderId)
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Work order not found.')
  return data as unknown as WorkOrderSyncRow
}

async function markSync(
  service: ServiceClient,
  workOrderId: string,
  status: SyncStatus,
  values: Record<string, unknown> = {}
) {
  await service
    .from('work_orders')
    .update({
      monday_sync_status: status,
      monday_sync_error: status === 'failed' ? values.monday_sync_error : null,
      ...(status === 'synced' ? { monday_synced_at: new Date().toISOString() } : {}),
      ...values,
    })
    .eq('id', workOrderId)
}

async function createMondayItem(client: MondayClient, config: PropertyMondayConfig, input: {
  itemName: string
  groupId: string | null
  columnValues: Record<string, unknown>
}) {
  const data = await client.graphql<{ create_item: MondayItemRef }>(
    `
      mutation CreatePropertyMondayItem(
        $boardId: ID!,
        $groupId: String,
        $itemName: String!,
        $columnValues: JSON!
      ) {
        create_item(
          board_id: $boardId,
          group_id: $groupId,
          item_name: $itemName,
          column_values: $columnValues
        ) {
          id
          name
          url
          group { id }
        }
      }
    `,
    {
      boardId: config.boardId,
      groupId: input.groupId,
      itemName: input.itemName,
      columnValues: JSON.stringify(input.columnValues),
    },
    `property-monday-create-${config.propertyId}-${input.itemName}`
  )
  return data.create_item
}

async function updateMondayItem(client: MondayClient, config: PropertyMondayConfig, input: {
  itemId: string
  columnValues: Record<string, unknown>
}) {
  const data = await client.graphql<{ change_multiple_column_values: MondayItemRef }>(
    `
      mutation UpdatePropertyMondayItem($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
        change_multiple_column_values(
          board_id: $boardId,
          item_id: $itemId,
          column_values: $columnValues
        ) {
          id
          name
          url
          group { id }
        }
      }
    `,
    {
      boardId: config.boardId,
      itemId: input.itemId,
      columnValues: JSON.stringify(input.columnValues),
    }
  )
  return data.change_multiple_column_values
}

async function moveMondayItem(client: MondayClient, input: { itemId: string; groupId: string }) {
  await client.graphql<{ move_item_to_group: MondayItemRef }>(
    `
      mutation MovePropertyMondayItem($itemId: ID!, $groupId: String!) {
        move_item_to_group(item_id: $itemId, group_id: $groupId) {
          id
          group { id }
        }
      }
    `,
    input
  )
}

async function findMondayItemByName(client: MondayClient, boardId: string, itemName: string) {
  let cursor: string | null = null
  for (let page = 0; page < 20; page += 1) {
    let pageData: MondayItemPage | undefined

    if (cursor) {
      const data: { next_items_page: MondayItemPage } = await client.graphql(
        `
          query FindPropertyMondayItemNext($cursor: String!) {
            next_items_page(cursor: $cursor, limit: 100) {
              cursor
              items { id name url group { id } }
            }
          }
        `,
        { cursor }
      )
      pageData = data.next_items_page
    } else {
      const data: { boards: Array<{ items_page: MondayItemPage }> } = await client.graphql(
        `
          query FindPropertyMondayItem($boardId: ID!) {
            boards(ids: [$boardId]) {
              items_page(limit: 100) {
                cursor
                items { id name url group { id } }
              }
            }
          }
        `,
        { boardId }
      )
      pageData = data.boards[0]?.items_page
    }

    const found = pageData?.items.find((item) => item.name === itemName)
    if (found) return found
    cursor = pageData?.cursor ?? null
    if (!cursor) break
  }
  return null
}

async function uploadMissingAttachments(client: MondayClient, input: {
  itemId: string
  columnId: string
  attachments: AttachmentRef[]
  existingAssets: StoredMondayFileAssets
}) {
  const assets: StoredMondayFileAssets = { ...input.existingAssets }

  for (const ref of input.attachments) {
    if (assets[ref.key]) continue
    const file = await downloadAttachment(ref)
    const uploaded = await client.uploadFileToColumn({
      itemId: input.itemId,
      columnId: input.columnId,
      fileName: file.fileName,
      contentType: file.contentType,
      buffer: file.buffer,
    })
    assets[ref.key] = {
      assetId: uploaded.id,
      name: uploaded.name ?? file.fileName,
      url: ref.url,
      uploadedAt: new Date().toISOString(),
    }
  }

  return assets
}

function isLikelyMissingMondayItem(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return [
    'item not found',
    'item_id',
    'invalid item',
    'resource not found',
    'does not exist',
    'not found',
  ].some((text) => message.includes(text))
}

async function resolveMondayItem(client: MondayClient, config: PropertyMondayConfig, wo: WorkOrderSyncRow, input: {
  groupId: string | null
  columnValues: Record<string, unknown>
  findExisting: boolean
}) {
  const foundByName = input.findExisting ? await findMondayItemByName(client, config.boardId, wo.wo_number) : null
  const itemId = foundByName?.id ?? wo.monday_item_id

  if (itemId) {
    try {
      return await updateMondayItem(client, config, {
        itemId,
        columnValues: input.columnValues,
      })
    } catch (error) {
      if (foundByName || !isLikelyMissingMondayItem(error)) throw error
    }
  }

  return createMondayItem(client, config, {
    itemName: wo.wo_number,
    groupId: input.groupId,
    columnValues: input.columnValues,
  })
}

export async function validateMondayToken(apiToken: string, apiVersion = DEFAULT_MONDAY_API_VERSION) {
  const client = new MondayClient({ apiToken, apiVersion })
  const data = await client.graphql<{ me: { id: string; name: string } }>(
    'query ValidateMondayToken { me { id name } }'
  )
  return data.me
}

export async function listMondayBoards(apiToken: string, apiVersion = DEFAULT_MONDAY_API_VERSION) {
  const client = new MondayClient({ apiToken, apiVersion })
  const data = await client.graphql<{ boards: Array<{ id: string; name: string }> }>(
    `
      query ListMondayBoards {
        boards(limit: 100) {
          id
          name
        }
      }
    `
  )
  return data.boards
}

export async function getMondayBoardDetails(apiToken: string, boardId: string, apiVersion = DEFAULT_MONDAY_API_VERSION) {
  const client = new MondayClient({ apiToken, apiVersion })
  const data = await client.graphql<{ boards: MondayBoardDetails[] }>(
    `
      query MondayBoardDetails($boardId: ID!) {
        boards(ids: [$boardId]) {
          id
          name
          groups { id title }
          columns { id title type }
        }
      }
    `,
    { boardId }
  )
  return data.boards[0] ?? null
}

export function autoMappingsForBoard(columns: MondayBoardColumn[]) {
  const mappings: MondayFieldMapping[] = []
  const unused = new Set(columns.map((column) => column.id))

  for (const field of MONDAY_FIELD_DEFINITIONS) {
    const normalizedLabel = normalizeTitle(field.label)
    const match = columns.find((column) => {
      if (!unused.has(column.id)) return false
      if (!field.compatibleTypes.includes(column.type)) return false
      const title = normalizeTitle(column.title)
      return title === normalizedLabel || title.includes(normalizedLabel) || normalizedLabel.includes(title)
    })

    if (match) {
      unused.delete(match.id)
      mappings.push({
        fieldId: field.id,
        columnId: match.id,
        columnTitle: match.title,
        columnType: match.type,
      })
    }
  }

  return mappings
}

export async function syncTenant360WorkOrder(workOrderId: string, options: { findExisting?: boolean } = {}): Promise<SyncResult> {
  const service = await createServiceClient()
  let mondayItem: MondayItemRef | null = null

  try {
    const wo = await fetchWorkOrderForSync(service, workOrderId)
    const isWaived = wo.is_cost_waived === true

    if (!isWaived && !wo.costing_approved_at) {
      await markSync(service, workOrderId, 'skipped', { monday_sync_error: null })
      return { status: 'skipped', skipped: true }
    }

    const state = await getPropertyMondayConfig(service, wo.property_id)
    if (!state.enabled) return { status: 'skipped', skipped: true }
    if (!state.config) {
      const message = `Monday configuration is incomplete: ${state.missing.join(', ')}`
      await markSync(service, workOrderId, 'failed', { monday_sync_error: message })
      return { status: 'failed', error: message }
    }

    const config = state.config
    const client = new MondayClient({ apiToken: config.apiToken, apiVersion: config.apiVersion })
    const groupId = isWaived ? config.waivedGroupId : config.billedGroupId
    const columnValues = buildColumnValues(wo, config.fieldMappings)

    mondayItem = await resolveMondayItem(client, config, wo, {
      groupId,
      columnValues,
      findExisting: options.findExisting !== false,
    })

    if (groupId && mondayItem.group?.id !== groupId) {
      await moveMondayItem(client, { itemId: mondayItem.id, groupId })
    }

    const fileMapping = filesMapping(config.fieldMappings)
    let mondayFileAssets = mondayItem.id === wo.monday_item_id ? wo.monday_file_assets ?? {} : {}
    if (fileMapping?.columnId) {
      mondayFileAssets = await uploadMissingAttachments(client, {
        itemId: mondayItem.id,
        columnId: fileMapping.columnId,
        attachments: collectAttachments(wo),
        existingAssets: mondayFileAssets,
      })
    }

    await markSync(service, workOrderId, 'synced', {
      monday_item_id: mondayItem.id,
      monday_item_url: mondayItem.url ?? wo.monday_item_url ?? null,
      monday_file_assets: mondayFileAssets,
    })

    return { status: 'synced', itemId: mondayItem.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Monday sync failed.'
    await markSync(service, workOrderId, 'failed', {
      monday_sync_error: message,
      ...(mondayItem?.id ? { monday_item_id: mondayItem.id, monday_item_url: mondayItem.url ?? null } : {}),
    })
    return { status: 'failed', error: message, itemId: mondayItem?.id ?? null }
  }
}

export async function validateIntegrationMappings(input: {
  apiToken: string
  apiVersion?: string
  boardId: string
  mappings: MondayFieldMapping[]
}) {
  const board = await getMondayBoardDetails(input.apiToken, input.boardId, input.apiVersion)
  if (!board) return { valid: false, error: 'Monday board was not found.', board: null }

  const columnMap = new Map(board.columns.map((column) => [column.id, column]))
  for (const mapping of input.mappings) {
    const column = columnMap.get(mapping.columnId)
    const field = getMondayFieldDefinition(mapping.fieldId)
    if (!field) return { valid: false, error: `Unknown FacilityPPM field: ${mapping.fieldId}`, board }
    if (!column) return { valid: false, error: `Mapped Monday column was not found: ${mapping.columnId}`, board }
    if (!isColumnCompatible(field.id, column.type)) {
      return { valid: false, error: `${field.label} is not compatible with Monday ${column.title} (${column.type}).`, board }
    }
  }

  return { valid: true, error: null, board }
}
