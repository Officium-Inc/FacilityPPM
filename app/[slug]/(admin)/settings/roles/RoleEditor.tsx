'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Info, Lock } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import {
  MODULES,
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
  normalizePermissions,
  scopeCovers,
  scopesFor,
  type PermissionKey,
  type Permissions,
  type Portal,
  type Scope,
} from '@/lib/authz/catalog'
import { canEditRole } from '@/lib/authz/escalation'
import type { ClientActor } from '@/lib/authz/permissions'
import type { PropertyRole } from '@/lib/authz/property-role'
import { WORK_TYPE_DESCRIPTIONS, WORK_TYPE_LABELS, WORK_TYPES, type WorkType } from '@/lib/authz/templates'
import { cn } from '@/lib/utils'

export type EditorMode = { kind: 'create'; from?: PropertyRole } | { kind: 'edit'; role: PropertyRole } | { kind: 'view'; role: PropertyRole }

interface Props {
  slug: string
  mode: EditorMode | null
  roles: PropertyRole[]
  actor: ClientActor
  onClose: () => void
}

const SCOPE_LABELS: Record<Scope, string> = {
  property: 'Whole property',
  assigned: 'Only work assigned to them',
  company: 'Their own company',
}

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500'

/** Keys that other granted keys need (shown checked and locked, with the reason). */
function requiredBy(permissions: Permissions) {
  const required = new Map<PermissionKey, string[]>()
  for (const key of PERMISSION_KEYS) {
    if (!permissions[key]) continue
    for (const implied of PERMISSION_CATALOG[key].implies ?? []) {
      required.set(implied, [...(required.get(implied) ?? []), PERMISSION_CATALOG[key].label])
    }
  }
  return required
}

export default function RoleEditor({ slug, mode, roles, actor, onClose }: Props) {
  if (!mode) return null
  // Remount per role so the form starts from that role
  const key = mode.kind === 'create' ? `create:${mode.from?.id ?? 'blank'}` : `${mode.kind}:${mode.role.id}`
  return <RoleEditorForm key={key} slug={slug} mode={mode} roles={roles} actor={actor} onClose={onClose} />
}

function RoleEditorForm({ slug, mode, roles, actor, onClose }: Props & { mode: EditorMode }) {
  const router = useRouter()
  const initial = mode.kind === 'create' ? mode.from : mode.role
  const isCreate = mode.kind === 'create'
  const readOnly = mode.kind === 'view'

  const [name, setName] = useState(isCreate ? (initial ? `${initial.name} (copy)` : '') : initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [portal, setPortal] = useState<Portal>(initial?.portal ?? 'staff')
  const [workType, setWorkType] = useState<WorkType>(initial?.workType ?? 'none')
  const [permissions, setPermissions] = useState<Permissions>(() =>
    initial ? normalizePermissions(initial.permissions, initial.portal) : {}
  )
  const [templateId, setTemplateId] = useState(mode.kind === 'create' ? mode.from?.id ?? '' : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isAdministrator = actor.kind === 'member' && actor.isAdministrator
  const required = useMemo(() => requiredBy(permissions), [permissions])
  const allowedByEscalation = canEditRole(
    actor,
    { id: mode.kind === 'create' ? undefined : mode.role.id, portal, isLocked: false },
    permissions,
    mode.kind === 'edit' ? mode.role.permissions : undefined
  )

  /** A non-Administrator can only give what they hold themselves, at most at their own scope. */
  function actorLimit(key: PermissionKey, scope: Scope) {
    if (isAdministrator || portal === 'tenant' || actor.kind !== 'member') return true
    const own = actor.permissions[key]
    return Boolean(own && scopeCovers(own, scope))
  }

  function defaultScope(key: PermissionKey): Scope | null {
    const allowed = scopesFor(key, portal).filter((scope) => actorLimit(key, scope))
    if (allowed.length === 0) return null
    // Service Group roles start on their assigned work
    if (workType === 'service_group' && allowed.includes('assigned')) return 'assigned'
    return allowed[0]
  }

  function toggle(key: PermissionKey, on: boolean) {
    setPermissions((current) => {
      const next = { ...current }
      if (on) {
        const scope = defaultScope(key)
        if (!scope) return current
        next[key] = scope
      } else {
        delete next[key]
      }
      return normalizePermissions(next, portal)
    })
  }

  function setScope(key: PermissionKey, scope: Scope) {
    setPermissions((current) => normalizePermissions({ ...current, [key]: scope }, portal))
  }

  function changePortal(next: Portal) {
    setPortal(next)
    if (next === 'tenant') setWorkType('none')
    // Grants of the other portal do not carry over
    setPermissions((current) => normalizePermissions(current, next))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (readOnly) return
    setSaving(true)
    setError(null)
    const payload: Record<string, unknown> = {
      name,
      description,
      work_type: portal === 'tenant' ? 'none' : workType,
      permissions,
    }
    if (isCreate) payload.portal = portal
    else payload.updated_at = mode.role.updatedAt

    const res = await fetch(
      isCreate
        ? `/api/properties/${encodeURIComponent(slug)}/roles`
        : `/api/properties/${encodeURIComponent(slug)}/roles/${mode.kind === 'edit' ? mode.role.id : ''}`,
      { method: isCreate ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    )
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setError(data.error ?? 'Could not save the role.')
      return
    }
    onClose()
    router.refresh()
  }

  const formId = `role-editor-${mode.kind}`
  const locked = mode.kind !== 'create' && mode.role.isLocked
  const lacksInspect = workType === 'service_group' && !permissions['workRequest.inspect']
  const lacksExecute = workType === 'service_group' && !permissions['workRequest.execute']

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      dismissible={!saving}
      title={isCreate ? 'New role' : readOnly ? initial?.name : `Edit ${initial?.name}`}
      description={
        locked
          ? 'The Administrator role has every staff permission. It cannot be edited or deleted.'
          : readOnly
            ? 'You can view this role but not change it.'
            : 'Choose who the role is for, what kind of work they do and what they may do.'
      }
      footer={
        readOnly ? (
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Close
          </button>
        ) : (
          <>
            <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              Cancel
            </button>
            <button
              type="submit"
              form={formId}
              disabled={saving || !name.trim() || !allowedByEscalation}
              className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-800 disabled:opacity-50"
            >
              {saving ? 'Saving…' : isCreate ? 'Create role' : 'Save changes'}
            </button>
          </>
        )
      }
    >
      <form id={formId} onSubmit={save} className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Role name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={60}
              disabled={readOnly}
              placeholder="e.g. Electrical Team"
              className={INPUT}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
              disabled={readOnly}
              placeholder="What people with this role do"
              className={INPUT}
            />
          </div>
        </div>

        {isCreate && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Start from</label>
            <select
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value)
                const template = roles.find((role) => role.id === e.target.value)
                if (!template) {
                  setPermissions({})
                  return
                }
                setPortal(template.portal)
                setWorkType(template.workType)
                setPermissions(normalizePermissions(template.permissions, template.portal))
              }}
              className={INPUT}
            >
              <option value="">An empty role</option>
              {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
          </div>
        )}

        <fieldset>
          <legend className="mb-2 text-xs font-medium text-gray-700">Portal {isCreate ? '*' : '(fixed after creation)'}</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(['staff', 'tenant'] as const).map((option) => (
              <label
                key={option}
                className={cn(
                  'flex items-start gap-3 rounded-lg border px-3 py-2.5',
                  portal === option ? 'border-green-600 bg-green-50' : 'border-gray-200',
                  isCreate && !readOnly ? 'cursor-pointer hover:bg-gray-50' : 'opacity-80'
                )}
              >
                <input type="radio" name="portal" value={option} checked={portal === option} disabled={!isCreate || readOnly} onChange={() => changePortal(option)} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium text-gray-900">{option === 'staff' ? 'Staff (Admin Portal)' : 'Tenant (Tenant Portal)'}</span>
                  <span className="block text-xs text-gray-500">
                    {option === 'staff' ? 'People who run and maintain the property.' : 'People of a tenant company. They see only their company’s requests.'}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {portal === 'staff' && (
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-gray-700">Work type</legend>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {WORK_TYPES.map((option) => (
                <label
                  key={option}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border px-3 py-2.5',
                    workType === option ? 'border-green-600 bg-green-50' : 'border-gray-200',
                    readOnly || locked ? 'opacity-80' : 'cursor-pointer hover:bg-gray-50'
                  )}
                >
                  <input type="radio" name="work_type" value={option} checked={workType === option} disabled={readOnly || locked} onChange={() => setWorkType(option)} className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">{WORK_TYPE_LABELS[option]}</span>
                    <span className="block text-xs text-gray-500">{WORK_TYPE_DESCRIPTIONS[option]}</span>
                  </span>
                </label>
              ))}
            </div>
            {!readOnly && (lacksInspect || lacksExecute) && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Service Group members are listed for inspections only when the role can record inspections, and for
                assignments only when it can do the work.
              </p>
            )}
          </fieldset>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-900">Permissions</h3>
            {!readOnly && !isAdministrator && portal === 'staff' && (
              <span className="text-xs text-gray-500">You can give only permissions you have; the role must have less access than yours.</span>
            )}
          </div>
          {MODULES.map((module) => {
            const keys = PERMISSION_KEYS.filter((key) => PERMISSION_CATALOG[key].module === module.key && scopesFor(key, portal).length > 0)
            if (keys.length === 0) return null
            return (
              <section key={module.key} className="rounded-xl border border-gray-200">
                <h4 className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{module.label}</h4>
                <ul className="divide-y divide-gray-100">
                  {keys.map((key) => {
                    const definition = PERMISSION_CATALOG[key]
                    const granted = permissions[key]
                    const neededBy = required.get(key)
                    const scopes = scopesFor(key, portal)
                    const canGrant = scopes.some((scope) => actorLimit(key, scope))
                    const disabled = readOnly || locked || Boolean(neededBy && granted) || (!granted && !canGrant)
                    return (
                      <li key={key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <label className={cn('flex items-start gap-3', disabled ? 'cursor-default' : 'cursor-pointer')}>
                          <input
                            type="checkbox"
                            checked={Boolean(granted)}
                            disabled={disabled}
                            onChange={(e) => toggle(key, e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600"
                          />
                          <span>
                            <span className="block text-sm font-medium text-gray-900">{definition.label}</span>
                            <span className="block text-xs text-gray-500">{definition.description}</span>
                            {neededBy && granted && (
                              <span className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400">
                                <Lock className="h-3 w-3" />
                                Needed by: {neededBy.join(', ')}
                              </span>
                            )}
                          </span>
                        </label>
                        {granted && scopes.length > 1 && (
                          <select
                            value={granted}
                            disabled={readOnly || locked}
                            onChange={(e) => setScope(key, e.target.value as Scope)}
                            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm sm:w-56"
                            aria-label={`${definition.label}: reach`}
                          >
                            {scopes.map((scope) => (
                              <option key={scope} value={scope} disabled={!actorLimit(key, scope)}>{SCOPE_LABELS[scope]}</option>
                            ))}
                          </select>
                        )}
                        {granted && scopes.length === 1 && (
                          <span className="text-xs text-gray-400 sm:w-56 sm:text-right">{SCOPE_LABELS[granted]}</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>

        {!readOnly && !allowedByEscalation && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This role would have as much access as yours or more. Remove a permission or narrow its reach.
          </div>
        )}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      </form>
    </Modal>
  )
}
