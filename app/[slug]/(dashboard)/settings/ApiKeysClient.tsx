'use client'

import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  KeyRound,
  PlugZap,
  RefreshCw,
  Save,
  Unplug,
} from 'lucide-react'

interface FieldDefinition {
  id: string
  label: string
  kind: string
  compatibleTypes: string[]
}

interface MondayBoard {
  id: string
  name: string
}

interface MondayColumn {
  id: string
  title: string
  type: string
}

interface MondayGroup {
  id: string
  title: string
}

interface BoardDetails extends MondayBoard {
  groups: MondayGroup[]
  columns: MondayColumn[]
}

interface FieldMapping {
  fieldId: string
  columnId: string
  columnType?: string
  columnTitle?: string
}

interface IntegrationSummary {
  connected: boolean
  enabled: boolean
  tokenLast4: string | null
  apiVersion: string | null
  boardId: string | null
  boardName: string | null
  billedGroupId: string | null
  waivedGroupId: string | null
  fieldMappings: FieldMapping[]
  validationStatus: string
  validationError: string | null
  updatedAt: string | null
}

interface SyncSummary {
  synced: number
  failed: number
  pending: number
  skipped: number
}

interface SyncRun {
  count: number
  results: Array<{ workOrderId: string; status: string; itemId?: string | null; error?: string }>
}

interface Props {
  canManageIntegrations: boolean
}

function mappingRecord(mappings: FieldMapping[]) {
  return mappings.reduce<Record<string, string>>((acc, mapping) => {
    acc[mapping.fieldId] = mapping.columnId
    return acc
  }, {})
}

function enabledRecord(mappings: FieldMapping[]) {
  return mappings.reduce<Record<string, boolean>>((acc, mapping) => {
    acc[mapping.fieldId] = true
    return acc
  }, {})
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? 'Request failed.')
  }
  return data as T
}

export default function ApiKeysClient({ canManageIntegrations }: Props) {
  const [integration, setIntegration] = useState<IntegrationSummary | null>(null)
  const [sync, setSync] = useState<SyncSummary | null>(null)
  const [fields, setFields] = useState<FieldDefinition[]>([])
  const [boards, setBoards] = useState<MondayBoard[]>([])
  const [board, setBoard] = useState<BoardDetails | null>(null)
  const [apiToken, setApiToken] = useState('')
  const [selectedBoardId, setSelectedBoardId] = useState('')
  const [billedGroupId, setBilledGroupId] = useState('')
  const [waivedGroupId, setWaivedGroupId] = useState('')
  const [mappingByField, setMappingByField] = useState<Record<string, string>>({})
  const [enabledByField, setEnabledByField] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [working, setWorking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const mappedFields = useMemo(() => (
    fields
      .filter((field) => enabledByField[field.id] && mappingByField[field.id])
      .map((field) => ({ fieldId: field.id, columnId: mappingByField[field.id] }))
  ), [enabledByField, fields, mappingByField])

  async function loadBoards() {
    const data = await fetch('/api/integrations/monday/boards').then((res) => readJson<{ boards: MondayBoard[] }>(res))
    setBoards(data.boards)
    return data.boards
  }

  async function loadBoardDetails(
    boardId: string,
    summary?: IntegrationSummary | null,
    applySuggestions = false
  ) {
    const data = await fetch(`/api/integrations/monday/boards/${encodeURIComponent(boardId)}`)
      .then((res) => readJson<{
        board: BoardDetails
        suggestedMappings: FieldMapping[]
        suggestedBilledGroupId: string | null
        suggestedWaivedGroupId: string | null
      }>(res))

    setBoard(data.board)
    setSelectedBoardId(data.board.id)

    const savedForBoard = summary?.boardId === data.board.id ? summary.fieldMappings : []
    const nextMappings = savedForBoard.length > 0 || !applySuggestions ? savedForBoard : data.suggestedMappings
    setMappingByField(mappingRecord(nextMappings))
    setEnabledByField(enabledRecord(nextMappings))
    setBilledGroupId(summary?.boardId === data.board.id ? summary.billedGroupId ?? '' : data.suggestedBilledGroupId ?? '')
    setWaivedGroupId(summary?.boardId === data.board.id ? summary.waivedGroupId ?? '' : data.suggestedWaivedGroupId ?? '')

    return data
  }

  async function loadSummary() {
    setLoading(true)
    setError(null)
    try {
      const data = await fetch('/api/integrations/monday')
        .then((res) => readJson<{ integration: IntegrationSummary; fields: FieldDefinition[]; sync: SyncSummary }>(res))
      setIntegration(data.integration)
      setFields(data.fields)
      setSync(data.sync)
      setSelectedBoardId(data.integration.boardId ?? '')
      setBilledGroupId(data.integration.billedGroupId ?? '')
      setWaivedGroupId(data.integration.waivedGroupId ?? '')
      setMappingByField(mappingRecord(data.integration.fieldMappings))
      setEnabledByField(enabledRecord(data.integration.fieldMappings))

      if (data.integration.connected) {
        await loadBoards()
        if (data.integration.boardId) {
          await loadBoardDetails(data.integration.boardId, data.integration, false)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Monday integration.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSummary()
  }, [])

  async function handleConnect(event: FormEvent) {
    event.preventDefault()
    if (!canManageIntegrations) return
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await fetch('/api/integrations/monday/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken }),
      }).then((res) => readJson(res))
      setApiToken('')
      setSuccess('Monday API key connected.')
      await loadSummary()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect Monday API key.')
    } finally {
      setSaving(false)
    }
  }

  async function handleBoardChange(boardId: string) {
    setSelectedBoardId(boardId)
    setError(null)
    setSuccess(null)
    if (!boardId) {
      setBoard(null)
      setMappingByField({})
      setEnabledByField({})
      return
    }

    setWorking('board')
    try {
      await loadBoardDetails(boardId, integration, true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Monday board.')
    } finally {
      setWorking(null)
    }
  }

  async function handleSaveConfig() {
    if (!canManageIntegrations || !selectedBoardId) return
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const data = await fetch('/api/integrations/monday/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boardId: selectedBoardId,
          billedGroupId: billedGroupId || null,
          waivedGroupId: waivedGroupId || null,
          enabled: true,
          fieldMappings: mappedFields,
        }),
      }).then((res) => readJson<{ integration: IntegrationSummary; board: BoardDetails; sync?: SyncRun }>(res))

      setIntegration(data.integration)
      setBoard(data.board)
      const synced = data.sync?.results.filter((item) => item.status === 'synced').length ?? 0
      const failed = data.sync?.results.filter((item) => item.status === 'failed').length ?? 0
      const firstError = data.sync?.results.find((item) => item.error)?.error
      setSuccess(`Monday configuration saved. Synced ${synced}, failed ${failed}.`)
      if (firstError) setError(firstError)
      await loadSummary()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Monday configuration.')
    } finally {
      setSaving(false)
    }
  }

  async function handleTestConfig() {
    if (!selectedBoardId) return
    setWorking('test')
    setError(null)
    setSuccess(null)
    try {
      await loadBoardDetails(selectedBoardId, integration, false)
      setSuccess('Monday board is reachable.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to test Monday configuration.')
    } finally {
      setWorking(null)
    }
  }

  async function handleSync() {
    if (!canManageIntegrations) return
    setWorking('sync')
    setError(null)
    setSuccess(null)
    try {
      const data = await fetch('/api/integrations/monday/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 50, includeSynced: true }),
      }).then((res) => readJson<SyncRun>(res))
      const synced = data.results.filter((item) => item.status === 'synced').length
      const failed = data.results.filter((item) => item.status === 'failed').length
      const firstError = data.results.find((item) => item.error)?.error
      setSuccess(`Processed ${data.count} work order${data.count === 1 ? '' : 's'} for Monday sync. Synced ${synced}, failed ${failed}.`)
      if (firstError) setError(firstError)
      await loadSummary()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync Monday work orders.')
    } finally {
      setWorking(null)
    }
  }

  async function handleDisconnect() {
    if (!canManageIntegrations) return
    setWorking('disconnect')
    setError(null)
    setSuccess(null)
    try {
      await fetch('/api/integrations/monday', { method: 'DELETE' }).then((res) => readJson(res))
      setBoards([])
      setBoard(null)
      setSelectedBoardId('')
      setBilledGroupId('')
      setWaivedGroupId('')
      setMappingByField({})
      setEnabledByField({})
      setSuccess('Monday disconnected.')
      await loadSummary()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect Monday.')
    } finally {
      setWorking(null)
    }
  }

  function compatibleColumns(field: FieldDefinition) {
    return board?.columns.filter((column) => field.compatibleTypes.includes(column.type)) ?? []
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
        Loading Monday integration...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>
      )}

      {!canManageIntegrations && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your role can view settings, but only admins and property managers can manage API keys.
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Monday.com</h3>
            <p className="mt-1 text-xs text-gray-500">
              {integration?.connected ? `Connected with key ending in ${integration.tokenLast4}` : 'No API key connected'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {sync && (
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                {sync.synced} synced / {sync.failed} failed
              </span>
            )}
            {integration?.connected && canManageIntegrations && (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={working === 'disconnect'}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Unplug className="h-4 w-4" />
                {working === 'disconnect' ? 'Disconnecting...' : 'Disconnect'}
              </button>
            )}
          </div>
        </div>

        {canManageIntegrations && (
          <form onSubmit={handleConnect} className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Monday API Key</label>
              <input
                type="password"
                value={apiToken}
                onChange={(event) => setApiToken(event.target.value)}
                placeholder={integration?.connected ? 'Paste a new key to replace the current one' : 'Paste Monday API key'}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Monday personal API tokens are long. Paste the full token; FacilityPPM stores it encrypted.
              </p>
            </div>
            <button
              type="submit"
              disabled={saving || !apiToken.trim()}
              className="inline-flex items-center justify-center gap-2 self-end rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              <KeyRound className="h-4 w-4" />
              {saving ? 'Validating...' : integration?.connected ? 'Replace Key' : 'Connect'}
            </button>
          </form>
        )}
      </div>

      {integration?.connected && (
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="grid gap-4 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Board</label>
              <select
                value={selectedBoardId}
                onChange={(event) => void handleBoardChange(event.target.value)}
                disabled={!canManageIntegrations || working === 'board'}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50"
              >
                <option value="">Select board</option>
                {boards.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Billed Group</label>
              <select
                value={billedGroupId}
                onChange={(event) => setBilledGroupId(event.target.value)}
                disabled={!canManageIntegrations || !board}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50"
              >
                <option value="">Board default group</option>
                {board?.groups.map((group) => (
                  <option key={group.id} value={group.id}>{group.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Waived Group</label>
              <select
                value={waivedGroupId}
                onChange={(event) => setWaivedGroupId(event.target.value)}
                disabled={!canManageIntegrations || !board}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50"
              >
                <option value="">Board default group</option>
                {board?.groups.map((group) => (
                  <option key={group.id} value={group.id}>{group.title}</option>
                ))}
              </select>
            </div>
          </div>

          {board && (
            <div className="mt-6 overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="w-12 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Use</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">FacilityPPM Field</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Monday Column</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {fields.map((field) => {
                    const columns = compatibleColumns(field)
                    const enabled = Boolean(enabledByField[field.id])
                    return (
                      <tr key={field.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={enabled}
                            disabled={!canManageIntegrations || columns.length === 0}
                            onChange={(event) => setEnabledByField((current) => ({
                              ...current,
                              [field.id]: event.target.checked,
                            }))}
                            className="h-4 w-4 rounded border-gray-300 text-green-700 focus:ring-green-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{field.label}</div>
                          <div className="text-xs text-gray-500">{field.kind}</div>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={mappingByField[field.id] ?? ''}
                            disabled={!canManageIntegrations || !enabled || columns.length === 0}
                            onChange={(event) => setMappingByField((current) => ({
                              ...current,
                              [field.id]: event.target.value,
                            }))}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50"
                          >
                            <option value="">{columns.length === 0 ? 'No compatible column' : 'Select column'}</option>
                            {columns.map((column) => (
                              <option key={column.id} value={column.id}>
                                {column.title} ({column.type})
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={handleTestConfig}
              disabled={!selectedBoardId || working === 'test'}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <PlugZap className="h-4 w-4" />
              {working === 'test' ? 'Testing...' : 'Test'}
            </button>
            <button
              type="button"
              onClick={handleSync}
              disabled={!integration.enabled || working === 'sync' || !canManageIntegrations}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
              {working === 'sync' ? 'Syncing...' : 'Retry Sync'}
            </button>
            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={!canManageIntegrations || !selectedBoardId || saving}
              className="inline-flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Mapping'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
