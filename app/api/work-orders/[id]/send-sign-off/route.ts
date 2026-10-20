import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { generateSignOffToken, getSignOffExpiry } from '@/lib/token'
import { sendSignOffEmail } from '@/lib/email'
import { authorizeWorkOrderStaff } from '@/lib/work-order-access'
import { syncTenant360WorkOrder } from '@/lib/monday/tenant360'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  // Verify auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = await createServiceClient()

  // Fetch work order
  const { data: wo, error: fetchErr } = await service
    .from('work_orders')
    .select(`
      id, wo_number, status, sign_off_token, property_id, tenant_email, tenant_name,
      ppm_schedules(title, assets(name, buildings(name, sites(name)))),
      properties(name)
    `)
    .eq('id', id)
    .single()

  if (fetchErr || !wo) {
    return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
  }

  // `verified` = head engineer approved, waiting for the tenant. `svc_submitted` only applies to
  // orders from the previous flow that already had a sign-off link.
  const isResendable = wo.status === 'verified' || (wo.status === 'svc_submitted' && wo.sign_off_token)
  if (!isResendable) {
    return NextResponse.json({ error: 'Work order is not waiting for tenant sign-off' }, { status: 400 })
  }

  const access = await authorizeWorkOrderStaff(service, user, wo.property_id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const token = generateSignOffToken()
  const expiresAt = getSignOffExpiry()

  const { error: updateErr } = await service
    .from('work_orders')
    .update({
      sign_off_token: token,
      sign_off_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Log to audit
  await service.from('audit_log').insert({
    property_id: (wo as { property_id?: string | null }).property_id ?? null,
    user_id: user.id,
    action: 'work_order.sign_off_link_sent',
    entity_type: 'work_order',
    entity_id: id,
    metadata: { token_generated: true },
    ip_address: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null,
  })

  // Send email — gracefully handle if mail isn't configured
  let emailSent = true
  try {
    const property = wo.properties as { name?: string } | { name?: string }[] | null
    const siteName = (Array.isArray(property) ? property[0]?.name : property?.name) ?? 'your property'
    const email = (wo as { tenant_email?: string | null }).tenant_email
    if (!email) throw new Error('No tenant email on record — cannot send sign-off link')
    await sendSignOffEmail({
      tenantEmail: email,
      tenantName: (wo as { tenant_name?: string | null }).tenant_name ?? email,
      woNumber: wo.wo_number,
      propertyName: siteName,
      token,
    })
  } catch {
    // Email failure is non-fatal; sign-off token is already set
    emailSent = false
  }

  await syncTenant360WorkOrder(id, { findExisting: true })

  return NextResponse.json({ success: true, token, emailSent })
}
