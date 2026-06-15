import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendSignOffEmail } from '@/lib/email'
import { getSignOffExpiry } from '@/lib/token'

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
    workDescription,
    completionPhotoUrls = [],
    supportingDocUrls = [],
    hoursLogged,
    tenantEmail,
    tenantName,
  } = body as {
    workDescription?: string
    completionPhotoUrls?: string[]
    supportingDocUrls?: string[]
    hoursLogged?: number
    tenantEmail?: string
    tenantName?: string
  }

  if (!workDescription?.trim()) {
    return NextResponse.json({ error: 'Work description is required.' }, { status: 400 })
  }
  if (!tenantEmail?.trim()) {
    return NextResponse.json({ error: 'Tenant email is required to send sign-off link.' }, { status: 400 })
  }

  const service = await createServiceClient()

  const { data: wo } = await service
    .from('work_orders')
    .select('id, status, wo_number, property_id, properties(name)')
    .eq('id', id)
    .single()

  if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })
  if (wo.status !== 'in_progress' && wo.status !== 'svc_submitted') {
    return NextResponse.json({ error: 'Work order is not in progress.' }, { status: 409 })
  }

  const { data: engineer } = await service
    .from('engineers')
    .select('id')
    .eq('user_id', user.id)
    .eq('property_id', wo.property_id)
    .maybeSingle()

  // Save completion evidence — try INSERT first, fall back to UPDATE on conflict
  const evidencePayload = {
    work_description: workDescription.trim(),
    completion_photo_urls: completionPhotoUrls,
    supporting_doc_urls: supportingDocUrls,
    submitted_by_id: engineer?.id ?? null,
    submitted_at: new Date().toISOString(),
  }

  const { error: insertErr } = await service
    .from('work_order_completion_evidence')
    .insert({ work_order_id: id, ...evidencePayload })

  if (insertErr) {
    // If a record already exists, update it
    const { error: updateErr } = await service
      .from('work_order_completion_evidence')
      .update(evidencePayload)
      .eq('work_order_id', id)

    if (updateErr) {
      console.error('[complete-evidence] failed to save evidence:', updateErr)
      return NextResponse.json({ error: 'Failed to save completion evidence.' }, { status: 500 })
    }
  }

  // Generate sign-off token
  const signOffToken = crypto.randomUUID()
  const signOffExpiry = getSignOffExpiry()

  const { error: updateErr } = await service.from('work_orders').update({
    status: 'svc_submitted',
    hours_logged: hoursLogged ?? null,
    sign_off_token: signOffToken,
    sign_off_expires_at: signOffExpiry.toISOString(),
    tenant_email: tenantEmail.trim(),
    tenant_name: tenantName?.trim() ?? tenantEmail.trim(),
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Send sign-off email to tenant
  try {
    const propertyName = (wo as { properties?: { name?: string } }).properties?.name ?? 'your property'
    await sendSignOffEmail({
      tenantEmail: tenantEmail.trim(),
      tenantName: tenantName?.trim() ?? tenantEmail.trim(),
      woNumber: wo.wo_number,
      propertyName,
      token: signOffToken,
    })
  } catch {
    // Non-fatal — token was saved, they can resend
  }

  return NextResponse.json({ success: true })
}
