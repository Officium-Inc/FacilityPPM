import { NextRequest, NextResponse } from 'next/server'
import { requireMondayPropertyAdmin } from '@/lib/monday/auth'
import { syncMondayWorkOrdersForProperty } from '@/lib/monday/backfill'

function cleanStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
}

export async function POST(request: NextRequest) {
  const auth = await requireMondayPropertyAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({})) as {
    workOrderIds?: unknown
    limit?: unknown
    includeSynced?: unknown
  }

  try {
    const { service, propertyId } = auth.context
    const result = await syncMondayWorkOrdersForProperty(service, propertyId, {
      workOrderIds: cleanStringArray(body.workOrderIds),
      limit: Number(body.limit) || 50,
      includeSynced: Boolean(body.includeSynced),
    })

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync Monday work orders.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
