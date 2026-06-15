const MONDAY_API_URL = 'https://api.monday.com/v2'
const MONDAY_FILE_API_URL = 'https://api.monday.com/v2/file'
const REQUEST_TIMEOUT_MS = 25_000

export interface MondayClientConfig {
  apiToken: string
  apiVersion: string
}

interface MondayGraphqlResponse<T> {
  data?: T
  errors?: Array<{ message?: string; [key: string]: unknown }>
  error_message?: string
}

export interface MondayItemRef {
  id: string
  name?: string
  url?: string | null
  group?: { id: string } | null
}

export interface MondayAssetRef {
  id: string
  name?: string | null
  url?: string | null
}

function timeoutSignal() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  return { signal: controller.signal, clear: () => clearTimeout(timeout) }
}

function mondayErrorMessage(payload: MondayGraphqlResponse<unknown>, fallback: string) {
  if (payload.error_message) return payload.error_message
  const messages = payload.errors?.map((error) => error.message).filter(Boolean)
  return messages?.length ? messages.join('; ') : fallback
}

export class MondayClient {
  constructor(private readonly config: MondayClientConfig) {}

  async graphql<T>(
    query: string,
    variables?: Record<string, unknown>,
    idempotencyKey?: string
  ): Promise<T> {
    const { signal, clear } = timeoutSignal()
    try {
      const response = await fetch(MONDAY_API_URL, {
        method: 'POST',
        headers: {
          Authorization: this.config.apiToken,
          'API-Version': this.config.apiVersion,
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: JSON.stringify({ query, variables }),
        signal,
      })

      const payload = (await response.json().catch(() => ({}))) as MondayGraphqlResponse<T>
      if (!response.ok || payload.errors?.length || payload.error_message) {
        throw new Error(mondayErrorMessage(payload, `Monday API request failed with ${response.status}`))
      }
      if (!payload.data) throw new Error('Monday API response did not include data.')
      return payload.data
    } finally {
      clear()
    }
  }

  async uploadFileToColumn(input: {
    itemId: string
    columnId: string
    fileName: string
    contentType: string
    buffer: Buffer
  }): Promise<MondayAssetRef> {
    const query = `
      mutation ($file: File!) {
        add_file_to_column(
          item_id: ${input.itemId},
          column_id: ${JSON.stringify(input.columnId)},
          file: $file
        ) {
          id
          name
          url
        }
      }
    `

    const form = new FormData()
    const fileBytes = new ArrayBuffer(input.buffer.byteLength)
    new Uint8Array(fileBytes).set(input.buffer)

    form.append('query', query)
    form.append('variables[file]', new Blob([fileBytes], { type: input.contentType }), input.fileName)

    const { signal, clear } = timeoutSignal()
    try {
      const response = await fetch(MONDAY_FILE_API_URL, {
        method: 'POST',
        headers: {
          Authorization: this.config.apiToken,
          'API-Version': this.config.apiVersion,
        },
        body: form,
        signal,
      })

      const payload = (await response.json().catch(() => ({}))) as MondayGraphqlResponse<{
        add_file_to_column?: MondayAssetRef
      }>
      if (!response.ok || payload.errors?.length || payload.error_message) {
        throw new Error(mondayErrorMessage(payload, `Monday file upload failed with ${response.status}`))
      }
      const asset = payload.data?.add_file_to_column
      if (!asset?.id) throw new Error('Monday file upload did not return an asset id.')
      return asset
    } finally {
      clear()
    }
  }
}
