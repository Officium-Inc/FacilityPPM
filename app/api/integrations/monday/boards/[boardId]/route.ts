import { NextRequest, NextResponse } from 'next/server'
import { requireMondayPropertyAdmin } from '@/lib/monday/auth'
import {
  autoMappingsForBoard,
  getMondayBoardDetails,
} from '@/lib/monday/tenant360'
import { getStoredMondayToken } from '@/lib/monday/store'

function groupIdByName(groups: Array<{ id: string; title: string }>, name: string) {
  return groups.find((group) => group.title.trim().toLowerCase() === name)?.id ?? null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const auth = await requireMondayPropertyAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { boardId } = await params
  if (!boardId) return NextResponse.json({ error: 'Board id is required.' }, { status: 400 })

  try {
    const { service, propertyId } = auth.context
    const { token, apiVersion } = await getStoredMondayToken(service, propertyId)
    const board = await getMondayBoardDetails(token, boardId, apiVersion)
    if (!board) return NextResponse.json({ error: 'Monday board was not found.' }, { status: 404 })

    return NextResponse.json({
      board,
      suggestedMappings: autoMappingsForBoard(board.columns),
      suggestedBilledGroupId: groupIdByName(board.groups, 'billed'),
      suggestedWaivedGroupId: groupIdByName(board.groups, 'waived'),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load Monday board.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
