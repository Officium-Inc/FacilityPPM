'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Copy, Eye, Lock, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import RoleEditor, { type EditorMode } from './RoleEditor'
import { PERMISSION_KEYS } from '@/lib/authz/catalog'
import { canDeleteRole, canEditRole } from '@/lib/authz/escalation'
import type { ClientActor } from '@/lib/authz/permissions'
import type { PropertyRole } from '@/lib/authz/property-role'
import { WORK_TYPE_LABELS } from '@/lib/authz/templates'

type RoleRow = PropertyRole & { memberCount: number; invitationCount: number }

interface Props {
  slug: string
  roles: RoleRow[]
  actor: ClientActor
  canManageRoles: boolean
}

/** Settings → Roles & Permissions: the property's roles, their portal, work type, members and permissions. */
export default function RolesClient({ slug, roles, actor, canManageRoles }: Props) {
  const router = useRouter()
  const [editor, setEditor] = useState<EditorMode | null>(null)
  const [deleting, setDeleting] = useState<RoleRow | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const holdsRole = (role: RoleRow) => actor.kind === 'member' && actor.roleId === role.id
  const editable = (role: RoleRow) => canManageRoles && !role.isLocked && !holdsRole(role) && canEditRole(actor, role, role.permissions, role.permissions)
  const deletable = (role: RoleRow) => canManageRoles && !role.isLocked && !holdsRole(role) && canDeleteRole(actor, role)

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    setDeleteError(null)
    const res = await fetch(`/api/properties/${encodeURIComponent(slug)}/roles/${deleting.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    setDeleteBusy(false)
    if (!res.ok) {
      setDeleteError(data.error ?? 'Could not delete the role.')
      return
    }
    setDeleting(null)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/${slug}/settings`} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-green-700">
          <ArrowLeft className="h-4 w-4" />
          Settings
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Roles &amp; Permissions</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Each member has one role. Staff roles are for the Admin Portal, tenant roles for the Tenant Portal. Service Group
              roles are the people work is assigned to.
            </p>
          </div>
          {canManageRoles && (
            <button
              type="button"
              onClick={() => setEditor({ kind: 'create' })}
              className="inline-flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-800"
            >
              <Plus className="h-4 w-4" />
              New role
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Role', 'Portal', 'Work type', 'Permissions', 'Members', ''].map((heading, index) => (
                  <th key={`${heading}-${index}`} className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {roles.map((role) => {
                const permissionCount = PERMISSION_KEYS.filter((key) => role.permissions[key]).length
                const inUse = role.memberCount > 0 || role.invitationCount > 0
                return (
                  <tr key={role.id} className="align-top hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-900">{role.name}</span>
                        {role.isLocked && (
                          <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">
                            <Lock className="h-3 w-3" />
                            Locked
                          </span>
                        )}
                        {role.systemKey && !role.isLocked && (
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">Default</span>
                        )}
                        {holdsRole(role) && <span className="rounded bg-green-50 px-1.5 py-0.5 text-[11px] font-medium text-green-700">Your role</span>}
                      </div>
                      {role.description && <p className="mt-0.5 max-w-md text-xs text-gray-500">{role.description}</p>}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{role.portal === 'staff' ? 'Staff' : 'Tenant'}</td>
                    <td className="px-5 py-3">
                      {role.workType === 'none' ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">{WORK_TYPE_LABELS[role.workType]}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{role.isLocked ? 'All' : permissionCount}</td>
                    <td className="px-5 py-3 text-gray-600">
                      {role.memberCount}
                      {role.invitationCount > 0 && <span className="ml-1 text-xs text-gray-400">(+{role.invitationCount} invited)</span>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {editable(role) ? (
                          <button type="button" onClick={() => setEditor({ kind: 'edit', role })} className="rounded p-1.5 text-gray-400 hover:bg-green-50 hover:text-green-700" title="Edit">
                            <Pencil className="h-4 w-4" />
                          </button>
                        ) : (
                          <button type="button" onClick={() => setEditor({ kind: 'view', role })} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="View permissions">
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                        {canManageRoles && (
                          <button type="button" onClick={() => setEditor({ kind: 'create', from: role })} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Duplicate">
                            <Copy className="h-4 w-4" />
                          </button>
                        )}
                        {deletable(role) && (
                          <button
                            type="button"
                            onClick={() => { setDeleteError(null); setDeleting(role) }}
                            disabled={inUse}
                            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                            title={inUse ? 'Give its members another role (and cancel its invitations) first' : 'Delete'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {!canManageRoles && (
        <p className="flex items-center gap-2 text-xs text-gray-500">
          <ShieldCheck className="h-4 w-4" />
          Only roles with “Manage roles” can create or change roles.
        </p>
      )}

      <RoleEditor slug={slug} mode={editor} roles={roles} actor={actor} onClose={() => setEditor(null)} />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete role"
        message={<>Delete the role <strong>{deleting?.name}</strong>? This cannot be undone.</>}
        confirmLabel="Delete"
        busyLabel="Deleting…"
        danger
        busy={deleteBusy}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
