import { NextRequest, NextResponse } from 'next/server'
import { DEFAULT_MONDAY_API_VERSION } from '@/lib/monday/config'
import { encryptMondayToken, maskMondayToken } from '@/lib/monday/crypto'
import { requireMondayPropertyAdmin } from '@/lib/monday/auth'
import { validateMondayToken } from '@/lib/monday/tenant360'
import {
  getMondayIntegrationRow,
  summarizeMondayIntegration,
} from '@/lib/monday/store'

export async function POST(request: NextRequest) {
  const auth = await requireMondayPropertyAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({})) as {
    apiToken?: unknown
    apiVersion?: unknown
  }

  const apiToken = typeof body.apiToken === 'string' ? body.apiToken.trim() : ''
  const apiVersion = typeof body.apiVersion === 'string' && body.apiVersion.trim()
    ? body.apiVersion.trim()
    : DEFAULT_MONDAY_API_VERSION

  if (!apiToken) {
    return NextResponse.json({ error: 'Monday API key is required.' }, { status: 400 })
  }

  try {
    const { service, propertyId, user } = auth.context
    await validateMondayToken(apiToken, apiVersion)

    const existing = await getMondayIntegrationRow(service, propertyId)
    const { error } = await service
      .from('property_monday_integrations')
      .upsert({
        property_id: propertyId,
        enabled: false,
        encrypted_api_token: encryptMondayToken(apiToken),
        token_last4: maskMondayToken(apiToken),
        api_version: apiVersion,
        validation_status: 'token_valid',
        validation_error: null,
        updated_by_user_id: user.id,
        ...(existing ? {} : { created_by_user_id: user.id }),
      }, { onConflict: 'property_id' })

    if (error) throw new Error(error.message)

    const row = await getMondayIntegrationRow(service, propertyId)
    return NextResponse.json({
      integration: summarizeMondayIntegration(row),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save Monday API key.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
