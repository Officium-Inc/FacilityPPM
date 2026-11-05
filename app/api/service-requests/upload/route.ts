import { NextRequest, NextResponse } from 'next/server'
import { IMAGE_TYPES, optimizeImage } from '@/lib/image-upload'
import { authorizeTenantSubmit, SERVICE_REPORT_BUCKET } from '@/lib/tenant-submit'
import { requireSession } from '@/lib/authz/guard'
import { fileRouteUrl } from '@/lib/storage-urls'

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB raw input limit per photo

export async function POST(request: NextRequest) {
  const session = await requireSession()
  if (!session.ok) return session.response
  const { service } = session

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const slug = (formData.get('slug') as string | null) ?? undefined

  if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
  if (!IMAGE_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only image files (JPG, PNG, WebP, GIF, AVIF) are allowed.' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Image too large. Maximum 10 MB.' }, { status: 400 })
  }

  const submitter = await authorizeTenantSubmit(session, slug)
  if (!submitter.ok) return submitter.response

  let buffer: Buffer
  try {
    buffer = await optimizeImage(Buffer.from(await file.arrayBuffer()))
  } catch {
    return NextResponse.json({ error: 'Could not process this image.' }, { status: 400 })
  }

  const fileName = `service-reports/${submitter.propertyId}/${submitter.actor.engineerId}/${Date.now()}-${crypto.randomUUID()}.webp`
  const { error: uploadError } = await service.storage
    .from(SERVICE_REPORT_BUCKET)
    .upload(fileName, buffer, { contentType: 'image/webp', upsert: false })

  if (uploadError) {
    console.error('[service-reports/upload] storage error:', uploadError)
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: { publicUrl } } = service.storage.from(SERVICE_REPORT_BUCKET).getPublicUrl(fileName)
  // The bucket is private: the browser shows the photo through the authenticated file route
  return NextResponse.json({ url: fileRouteUrl(publicUrl) }, { status: 201 })
}
