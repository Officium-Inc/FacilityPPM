import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { IMAGE_TYPES, optimizeImage } from '@/lib/image-upload'
import { resolveTenantSubmitter, SERVICE_REPORT_BUCKET } from '@/lib/tenant-submit'

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB raw input limit per photo

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  const service = await createServiceClient()
  const submitter = await resolveTenantSubmitter(service, user, slug)
  if (!submitter.ok) return NextResponse.json({ error: submitter.error }, { status: submitter.status })

  let buffer: Buffer
  try {
    buffer = await optimizeImage(Buffer.from(await file.arrayBuffer()))
  } catch {
    return NextResponse.json({ error: 'Could not process this image.' }, { status: 400 })
  }

  const fileName = `service-reports/${submitter.propertyId}/${submitter.engineer.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`
  const { error: uploadError } = await service.storage
    .from(SERVICE_REPORT_BUCKET)
    .upload(fileName, buffer, { contentType: 'image/webp', upsert: false })

  if (uploadError) {
    console.error('[service-reports/upload] storage error:', uploadError)
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: { publicUrl } } = service.storage.from(SERVICE_REPORT_BUCKET).getPublicUrl(fileName)
  return NextResponse.json({ url: publicUrl }, { status: 201 })
}
