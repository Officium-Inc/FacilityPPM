import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { normalizeRoleName } from '@/lib/roles'

const VALID_URGENCIES = new Set(['critical', 'high', 'medium', 'low'])

function roleNameFromRelation(roles: unknown) {
  if (!roles) return ''
  if (Array.isArray(roles)) {
    return normalizeRoleName((roles[0] as { name?: string } | undefined)?.name)
  }
  return normalizeRoleName((roles as { name?: string } | null)?.name)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    slug,
    faultDescription,
    locationNotes,
    reportedByContact,
    urgency = 'medium',
    photoUrls = [],
  } = body as {
    slug?: string
    faultDescription?: string
    locationNotes?: string
    reportedByContact?: string
    urgency?: string
    photoUrls?: string[]
  }

  if (!faultDescription?.trim()) {
    return NextResponse.json({ error: 'Description is required.' }, { status: 400 })
  }

  const normalizedUrgency = VALID_URGENCIES.has(urgency) ? urgency : 'medium'
  const service = await createServiceClient()

  let propertyId = user.app_metadata?.property_id as string | undefined
  if (slug) {
    const userSlugs: string[] = (user.app_metadata?.property_slugs as string[] | undefined) ??
      (user.app_metadata?.property_slug ? [user.app_metadata.property_slug as string] : [])
    if (!userSlugs.includes(slug)) {
      return NextResponse.json({ error: 'Property access denied.' }, { status: 403 })
    }

    const { data: property } = await service
      .from('properties')
      .select('id')
      .eq('slug', slug)
      .single()

    if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 })
    propertyId = property.id
  }

  if (!propertyId) return NextResponse.json({ error: 'No active property.' }, { status: 400 })

  const { data: engineer } = await service
    .from('engineers')
    .select('id, full_name, email, is_active, roles(name)')
    .eq('property_id', propertyId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!engineer || engineer.is_active === false) {
    return NextResponse.json({ error: 'Tenant member not found.' }, { status: 403 })
  }

  const role = roleNameFromRelation(engineer.roles)
  if (role !== 'tenant') {
    return NextResponse.json({ error: 'Only tenant users can submit tenant service requests.' }, { status: 403 })
  }

  const reportedByName = engineer.full_name || user.email || 'Tenant'
  const contact = reportedByContact?.trim() || engineer.email || user.email || null
  const woNumber = `REPT-${Date.now().toString(36).toUpperCase()}`

  const { data: wo, error: woErr } = await service
    .from('work_orders')
    .insert({
      property_id: propertyId,
      requested_by_id: engineer.id,
      tenant_name: reportedByName,
      tenant_email: engineer.email || user.email || null,
      wo_number: woNumber,
      type: 'reactive',
      status: 'new_report',
      priority: normalizedUrgency,
    })
    .select('id')
    .single()

  if (woErr) return NextResponse.json({ error: woErr.message }, { status: 500 })

  const { data: report, error: reportErr } = await service
    .from('work_order_reports')
    .insert({
      work_order_id: wo.id,
      fault_description: faultDescription.trim(),
      location_notes: locationNotes?.trim() ?? null,
      reported_by_name: reportedByName,
      reported_by_contact: contact,
      urgency: normalizedUrgency,
      photo_urls: photoUrls,
    })
    .select('id')
    .single()

  if (reportErr) {
    await service.from('work_orders').delete().eq('id', wo.id)
    return NextResponse.json({ error: reportErr.message }, { status: 500 })
  }

  await service.from('work_orders').update({ report_id: report.id }).eq('id', wo.id)

  return NextResponse.json({ workOrderId: wo.id, woNumber }, { status: 201 })
}
