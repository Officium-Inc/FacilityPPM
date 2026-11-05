import { NextRequest, NextResponse } from 'next/server'
import { authorize, requireSession, type Session } from '@/lib/authz/guard'
import { WORK_ORDER_SCOPE_COLUMNS } from '@/lib/authz/records'
import { fileOwnerFromPath, storedFileUrl, toStorageRef } from '@/lib/storage-urls'

interface Params {
  params: Promise<{ bucket: string; path: string[] }>
}

/** Signed URLs handed out by this route expire quickly; the route is the durable link. */
const SIGNED_URL_SECONDS = 60

function notFound() {
  return NextResponse.json({ error: 'File not found.' }, { status: 404 })
}

async function authorizeWorkOrderFile(session: Session, workOrderId: string, propertyId: string | null) {
  const { data: wo } = await session.service
    .from('work_orders')
    .select(WORK_ORDER_SCOPE_COLUMNS)
    .eq('id', workOrderId)
    .maybeSingle()
  // A path that names a property must belong to the work order's property
  if (!wo || (propertyId && wo.property_id !== propertyId)) return { ok: false as const, response: notFound() }
  return authorize(session, 'workRequest.view', { record: wo })
}

/**
 * Serves a file from the private storage buckets (migration 023): the caller must be allowed to view the
 * work order the file belongs to (or be the tenant who uploaded a photo for a report not submitted yet).
 * Redirects to a short-lived signed URL.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const { bucket, path } = await params
  const ref = toStorageRef(bucket, (path ?? []).join('/'))
  if (!ref) return notFound()
  const owner = fileOwnerFromPath(ref.path)
  if (!owner) return notFound()

  const session = await requireSession()
  if (!session.ok) return session.response

  if (owner.kind === 'workOrder') {
    const access = await authorizeWorkOrderFile(session, owner.workOrderId, owner.propertyId)
    if (!access.ok) return access.response
  } else {
    // Once the report is submitted, the photo belongs to its work order.
    // photo_urls is jsonb: pass a JSON array (an array argument would be sent as a Postgres array literal).
    const { data: report } = await session.service
      .from('work_order_reports')
      .select('work_order_id')
      .contains('photo_urls', JSON.stringify([storedFileUrl(ref)]))
      .not('work_order_id', 'is', null)
      .limit(1)
      .maybeSingle()

    if (report) {
      const access = await authorizeWorkOrderFile(session, report.work_order_id as string, owner.propertyId)
      if (!access.ok) return access.response
    } else {
      // Not submitted yet: only the tenant who uploaded it
      if (!owner.memberId) return notFound()
      const access = await authorize(session, 'workRequest.submit', { propertyId: owner.propertyId })
      if (!access.ok) return access.response
      if (access.actor.kind !== 'member' || access.actor.engineerId !== owner.memberId) return notFound()
    }
  }

  const { data, error } = await session.service.storage.from(ref.bucket).createSignedUrl(ref.path, SIGNED_URL_SECONDS)
  if (error || !data?.signedUrl) return notFound()

  const response = NextResponse.redirect(data.signedUrl, 302)
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}