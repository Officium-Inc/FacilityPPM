import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { createClient, createServiceClient } from '@/lib/supabase/server'

interface Params {
  params: Promise<{ id: string }>
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
const ALLOWED_TYPES = [...IMAGE_TYPES, 'application/pdf']
const MAX_SIZE = 20 * 1024 * 1024 // 20 MB raw input limit
const BUCKET = 'receipts'

// Images are converted to WebP at 80% quality, max 1920px on the longest side
const IMAGE_MAX_PX = 1920
const IMAGE_QUALITY = 80

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 })

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'File type not allowed. Upload images (JPEG, PNG, WebP, GIF, AVIF) or PDF only.' },
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
    uploadBuffer = await sharp(raw)
      .rotate() // auto-orient from EXIF
      .resize(IMAGE_MAX_PX, IMAGE_MAX_PX, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: IMAGE_QUALITY })
      .toBuffer()
    contentType = 'image/webp'
    ext = 'webp'
  } else {
    // PDF — store as-is
    uploadBuffer = raw
    contentType = 'application/pdf'
    ext = 'pdf'
  }

  const fileName = `${id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const service = await createServiceClient()

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

  return NextResponse.json({ url: publicUrl }, { status: 201 })
}
