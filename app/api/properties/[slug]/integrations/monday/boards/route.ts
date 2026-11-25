import { NextRequest, NextResponse } from 'next/server'
import { requireMondayPropertyAdmin, type MondayRouteParams } from '@/lib/monday/auth'
import { listMondayBoards } from '@/lib/monday/tenant360'
import { getStoredMondayToken } from '@/lib/monday/store'

export async function GET(_request: NextRequest, { params }: { params: MondayRouteParams }) {
  const auth = await requireMondayPropertyAdmin(params)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { service, propertyId } = auth.context
    const { token, apiVersion } = await getStoredMondayToken(service, propertyId)
    const boards = await listMondayBoards(token, apiVersion)
    return NextResponse.json({ boards })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list Monday boards.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
