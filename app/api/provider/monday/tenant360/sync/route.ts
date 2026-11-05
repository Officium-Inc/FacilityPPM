import { NextResponse } from 'next/server'
import { requireProvider } from '@/lib/authz/guard'


export async function POST() {
  const provider = await requireProvider()
  if (!provider.ok) return provider.response

  return NextResponse.json(
    { error: 'Monday sync moved to each property Settings API Keys tab.' },
    { status: 410 }
  )
}
