import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateSignOffToken, getSignOffExpiry } from '@/lib/token'
import { sendSignOffEmail } from '@/lib/email'

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

  // Fetch work order
  const { data: wo, error: fetchErr } = await supabase
    .from('work_orders')
    .select(`
      id, wo_number, status, sign_off_token, property_id,
      ppm_schedules(title, assets(name, buildings(name, sites(name))))
    `)
    .eq('id', id)
    .single()

  if (fetchErr || !wo) {
    return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
  }

  const VALID_STATUSES = ['completed', 'assigned', 'in_progress', 'svc_submitted']
  if (!VALID_STATUSES.includes(wo.status)) {
    return NextResponse.json({ error: 'Work order is not in a valid state for sign-off' }, { status: 400 })
  }

  const token = generateSignOffToken()
  const expiresAt = getSignOffExpiry()

  const { error: updateErr } = await supabase
    .from('work_orders')
    .update({
      status: wo.status === 'svc_submitted' ? 'svc_submitted' : 'completed',
      sign_off_token: token,
      sign_off_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Log to audit
  await supabase.from('audit_log').insert({
    property_id: (wo as { property_id?: string | null }).property_id ?? null,
    user_id: user.id,
    action: 'work_order.sign_off_link_sent',
    entity_type: 'work_order',
    entity_id: id,
    metadata: { token_generated: true },
    ip_address: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null,
  })

  // Send email — gracefully handle if Resend isn't configured
  try {
    const assets = (wo.ppm_schedules as { assets?: { name?: string; buildings?: { sites?: { name?: string } } } } | null)?.assets
    const siteName = assets?.buildings?.sites?.name ?? 'your property'
    await sendSignOffEmail({
      tenantEmail: 'tenant@example.com', // In production, pull from tenant record
      tenantName: 'Tenant',
      woNumber: wo.wo_number,
      propertyName: siteName,
      token,
    })
  } catch {
    // Email failure is non-fatal; sign-off token is already set
  }

  return NextResponse.json({ success: true, token })
}
