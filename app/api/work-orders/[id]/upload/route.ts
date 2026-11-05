import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { IMAGE_TYPES, optimizeImage } from '@/lib/image-upload'
import { authorizeWorkOrderStaff } from '@/lib/work-order-access'
import { WORK_ORDER_FILE_BUCKET, workOrderFilePath } from '@/lib/work-order-files'

interface Params {
  params: Promise<{ id: string }>
}

const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/mpeg']
const ALLOWED_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES, 'application/pdf']
const MAX_SIZE = 20 * 1024 * 1024 // 20 MB raw input limit
const BUCKET = WORK_ORDER_FILE_BUCKET

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = await createServiceClient()
  const { data: wo } = await service
    .from('work_orders')
    .select('id, property_id, engineer_id')
    .eq('id', id)
    .maybeSingle()
  if (!wo?.property_id) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 })

  // Staff, or the Service Group member assigned to this work order
  const access = await authorizeWorkOrderStaff(service, user, wo.property_id, { assignedEngineerId: wo.engineer_id })
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

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

  return NextResponse.json({ url: publicUrl, contentType }, { status: 201 })
}
