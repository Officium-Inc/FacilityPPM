import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

interface Params {
  params: Promise<{ id: string }>
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

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
      { error: 'File type not allowed. Upload images (JPEG, PNG, WebP, GIF) or PDF only.' },
      { status: 400 }
    )
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large. Maximum size is 10 MB.' }, { status: 400 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
  const fileName = `${id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const service = await createServiceClient()

  const { error: uploadError } = await service.storage
    .from('evidence')
    .upload(fileName, buffer, { contentType: file.type, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const {
    data: { publicUrl },
  } = service.storage.from('evidence').getPublicUrl(fileName)

  return NextResponse.json({ url: publicUrl }, { status: 201 })
}
