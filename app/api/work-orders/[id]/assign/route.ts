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
  const {
    engineerId,
    dueDate,
    instructions,
    priority,
  } = body as {
    engineerId?: string
    dueDate?: string
    instructions?: string
    priority?: string
  }

  if (!engineerId) {
    return NextResponse.json({ error: 'Engineer is required.' }, { status: 400 })
  }

  const service = await createServiceClient()

  const { data: wo } = await service
    .from('work_orders')
    .select('id, status, property_id')
    .eq('id', id)
    .single()

  if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })
  if (wo.status !== 'assigned') {
    return NextResponse.json({ error: 'Work order is not in assignment stage.' }, { status: 409 })
  }

  // Resolve the head engineer making the assignment
  const { data: headEngineer } = await service
    .from('engineers')
    .select('id')
    .eq('user_id', user.id)
    .eq('property_id', wo.property_id)
    .maybeSingle()

  const { error } = await service.from('work_orders').update({
    engineer_id: engineerId,
    head_engineer_id: headEngineer?.id ?? null,
    due_date: dueDate ?? null,
    assignment_instructions: instructions?.trim() ?? null,
    priority: priority ?? undefined,
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
