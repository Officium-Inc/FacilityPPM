import { NextResponse } from 'next/server'
import { requireProvider } from '@/lib/authz/guard'


export async function GET() {
  const provider = await requireProvider()
  if (!provider.ok) return provider.response

  return NextResponse.json(
    { error: 'Monday setup moved to each property Settings API Keys tab.' },
    { status: 410 }
  )
}
