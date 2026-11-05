import { NextRequest, NextResponse } from 'next/server'
import { authorize, requireSession } from '@/lib/authz/guard'
import { WORK_ORDER_SCOPE_COLUMNS } from '@/lib/authz/records'
import { IMAGE_TYPES, optimizeImage } from '@/lib/image-upload'
import { WORK_ORDER_FILE_BUCKET, workOrderFilePath } from '@/lib/work-order-files'
import { fileRouteUrl } from '@/lib/storage-urls'

interface Params {
  params: Promise<{ id: string }>
}

const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/mpeg']
const ALLOWED_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES, 'application/pdf']
const MAX_SIZE = 20 * 1024 * 1024 // 20 MB raw input limit
const BUCKET = WORK_ORDER_FILE_BUCKET

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params

  const session = await requireSession()

  if (!session.ok) return session.response

  const { service } = session
  const { data: wo } = await service
    .from('work_orders')
    .select(WORK_ORDER_SCOPE_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (!wo?.property_id) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })

  // Staff, or the Service Group member assigned to this work order
  const access = await authorize(session, 'workRequest.execute', { record: wo })
  if (!access.ok) return access.response

  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 })

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'File type not allowed. Upload images, videos, or PDF only.' },
      { status: 400 }
    )
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large. Maximum 20 MB.' }, { status: 400 })
  }

  const raw = Buffer.from(await file.arrayBuffer())
  const isImage = IMAGE_TYPES.includes(file.type)

  let uploadBuffer: Buffer
  let contentType: string
  let ext: string

  if (isImage) {
    // Convert to WebP and resize to at most IMAGE_MAX_PX on the longest side
    uploadBuffer = await optimizeImage(raw)
    contentType = 'image/webp'
    ext = 'webp'
  } else {
    // PDF/video: store as-is.
    uploadBuffer = raw
    contentType = file.type
    ext = file.type === 'application/pdf'
      ? 'pdf'
      : file.type === 'video/quicktime'
      ? 'mov'
      : file.type.split('/')[1] ?? 'bin'
  }

  const fileName = workOrderFilePath(wo.property_id, id, `${Date.now()}-${crypto.randomUUID()}.${ext}`)

  const { error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(fileName, uploadBuffer, { contentType, upsert: false })

  if (uploadError) {
    console.error('[upload] storage error:', uploadError)
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const {
    data: { publicUrl },
  } = service.storage.from(BUCKET).getPublicUrl(fileName)

  // The bucket is private: the browser shows the file through the authenticated file route
  return NextResponse.json({ url: fileRouteUrl(publicUrl), contentType }, { status: 201 })
}
