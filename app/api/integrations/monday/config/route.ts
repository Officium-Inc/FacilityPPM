import { NextRequest, NextResponse } from 'next/server'
import { requireMondayPropertyAdmin } from '@/lib/monday/auth'
import {
  getMondayBoardDetails,
  type MondayBoardDetails,
} from '@/lib/monday/tenant360'
import { syncMondayWorkOrdersForProperty } from '@/lib/monday/backfill'
import {
  getMondayFieldDefinition,
  isColumnCompatible,
  type MondayFieldMapping,
} from '@/lib/monday/fields'
import {
  asMondayFieldMappings,
  clearMondayTrackingForProperty,
  getMondayIntegrationRow,
  getStoredMondayToken,
  summarizeMondayIntegration,
} from '@/lib/monday/store'

function cleanId(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function attachmentColumn(mappings: MondayFieldMapping[]) {
  return mappings.find((mapping) => mapping.fieldId === 'attachments')?.columnId ?? null
}

function normalizeMappings(value: unknown, board: MondayBoardDetails): MondayFieldMapping[] {
  if (!Array.isArray(value)) return []

  const columns = new Map(board.columns.map((column) => [column.id, column]))
  const seenFields = new Set<string>()
  const mappings: MondayFieldMapping[] = []

  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Record<string, unknown>
    const fieldId = cleanId(raw.fieldId)
    const columnId = cleanId(raw.columnId)
    if (!fieldId || !columnId || seenFields.has(fieldId)) continue

    const field = getMondayFieldDefinition(fieldId)
    const column = columns.get(columnId)
    if (!field) throw new Error(`Unknown FacilityPPM field: ${fieldId}`)
    if (!column) throw new Error(`Mapped Monday column was not found: ${columnId}`)
    if (!isColumnCompatible(field.id, column.type)) {
      throw new Error(`${field.label} is not compatible with Monday ${column.title} (${column.type}).`)
    }

    seenFields.add(fieldId)
    mappings.push({
      fieldId,
      columnId,
      columnTitle: column.title,
      columnType: column.type,
    })
  }

  return mappings
}

export async function PUT(request: NextRequest) {
  const auth = await requireMondayPropertyAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({})) as {
    boardId?: unknown
    billedGroupId?: unknown
    waivedGroupId?: unknown
    enabled?: unknown
    fieldMappings?: unknown
  }

  const boardId = cleanId(body.boardId)
  const billedGroupId = cleanId(body.billedGroupId)
  const waivedGroupId = cleanId(body.waivedGroupId)
  const enabled = body.enabled === undefined ? true : Boolean(body.enabled)

  if (!boardId) {
    return NextResponse.json({ error: 'Monday board is required.' }, { status: 400 })
  }

  try {
    const { service, propertyId, user } = auth.context
    const existing = await getMondayIntegrationRow(service, propertyId)
    const { token, apiVersion } = await getStoredMondayToken(service, propertyId)
    const board = await getMondayBoardDetails(token, boardId, apiVersion)
    if (!board) return NextResponse.json({ error: 'Monday board was not found.' }, { status: 404 })

    const groupIds = new Set(board.groups.map((group) => group.id))
    if (billedGroupId && !groupIds.has(billedGroupId)) {
      return NextResponse.json({ error: 'Billed group does not belong to the selected board.' }, { status: 400 })
    }
    if (waivedGroupId && !groupIds.has(waivedGroupId)) {
      return NextResponse.json({ error: 'Waived group does not belong to the selected board.' }, { status: 400 })
    }

    const fieldMappings = normalizeMappings(body.fieldMappings, board)
    const previousMappings = asMondayFieldMappings(existing?.field_mappings)
    const boardChanged = Boolean(existing?.board_id && existing.board_id !== board.id)
    const filesColumnChanged = attachmentColumn(previousMappings) !== attachmentColumn(fieldMappings)

    const { error } = await service
      .from('property_monday_integrations')
      .upsert({
        property_id: propertyId,
        enabled,
        api_version: apiVersion,
        board_id: board.id,
        board_name: board.name,
        billed_group_id: billedGroupId,
        waived_group_id: waivedGroupId,
        field_mappings: fieldMappings,
        validation_status: 'valid',
        validation_error: null,
        updated_by_user_id: user.id,
        ...(existing ? {} : { created_by_user_id: user.id }),
      }, { onConflict: 'property_id' })

    if (error) throw new Error(error.message)

    if (boardChanged) {
      await clearMondayTrackingForProperty(service, propertyId, { clearItems: true, clearFiles: true })
    } else if (filesColumnChanged) {
      await clearMondayTrackingForProperty(service, propertyId, { clearItems: false, clearFiles: true })
    }

    const row = await getMondayIntegrationRow(service, propertyId)
    const sync = enabled
      ? await syncMondayWorkOrdersForProperty(service, propertyId, { limit: 50, includeSynced: false })
      : { count: 0, results: [] }

    return NextResponse.json({
      integration: summarizeMondayIntegration(row),
      board,
      sync,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save Monday configuration.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
