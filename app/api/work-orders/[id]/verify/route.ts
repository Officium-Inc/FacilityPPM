import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { notes } = body as { notes?: string }

  const service = await createServiceClient()

  const { data: wo } = await service
    .from('work_orders')
    .select('id, status, property_id, engineer_id')
    .eq('id', id)
    .single()

  if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })
  if (wo.status !== 'signed') {
    return NextResponse.json({ error: 'Work order has not been signed off yet.' }, { status: 409 })
  }

  // Resolve head engineer
  const { data: headEngineer } = await service
    .from('engineers')
    .select('id, full_name')
    .eq('user_id', user.id)
    .eq('property_id', wo.property_id)
    .maybeSingle()

  const now = new Date().toISOString()

  const { error } = await service.from('work_orders').update({
    status: 'completed',
    head_engineer_id: headEngineer?.id ?? null,
    head_engineer_verified_at: now,
    head_engineer_notes: notes?.trim() ?? null,
    updated_at: now,
  }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await service.from('approval_trail').insert({
    work_order_id: wo.id,
    stage: 'final_verification',
    actor_name: headEngineer?.full_name ?? 'Head Engineer',
    actor_role: 'head_engineer',
    decision: 'approved',
    reason: notes?.trim() ?? null,
  })

  // Trigger PDF generation (fire-and-forget)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl) {
    fetch(`${appUrl}/api/pdf/${id}`, { method: 'GET' }).catch(() => {})
  }

  return NextResponse.json({ success: true })
}
