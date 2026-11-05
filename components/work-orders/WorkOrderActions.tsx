'use client'

import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import type { WorkOrder, Engineer, Priority, ProvidedBy, CostingLineItem, WorkOrderCosting, WorkOrderCompletionEvidence } from '@/types'
import { Send, RefreshCw, ClipboardCheck, UserCheck, Paperclip, X, Ban, Plus, Calculator, Check, Undo2 } from 'lucide-react'
import { cn, formatPHT } from '@/lib/utils'
import { normalizeRoleName } from '@/lib/roles'
import { PRIORITY_OPTIONS, priorityOptionLabel, suggestDueDate } from '@/lib/priority'
import { PROVIDED_BY_OPTIONS, costingToLineItems, lineItemTotal, roundMoney, summarizeLineItems } from '@/lib/costing'

type InspectionOutcome = 'proceed' | 'third_party' | 'cancel'

/** Read-only job context shown in the Assign Work Order modal (sourced from the originating tenant report + approved cost). */
interface AssignJobSummary {
  location?: string | null
  requestedBy?: string | null
  reportedIssue?: string | null
  approvedCost?: number | null
}

interface WorkOrderActionsProps {
  workOrder: WorkOrder
  engineers?: Engineer[]
  slug: string
  /** What the signed-in user may do with this work order (from lib/authz). The API enforces the same rules. */
  permissions: WorkOrderActionPermissions
  /** Previously saved estimate, used to prefill the costing form when it is revised. */
  existingCosting?: Pick<WorkOrderCosting, 'labour_hours' | 'labour_rate' | 'materials_total' | 'subcontractor_total' | 'line_items' | 'notes'> | null
  /** Previously submitted completion evidence, used to prefill the form when work is sent back for rework. */
  existingEvidence?: Pick<WorkOrderCompletionEvidence, 'work_description' | 'completion_photo_urls' | 'supporting_doc_urls'> | null
  /** Context about the job being assigned, shown read-only in the Assign Work Order modal. */
  jobSummary?: AssignJobSummary
}

export interface WorkOrderActionPermissions {
  review: boolean
  inspect: boolean
  assign: boolean
  execute: boolean
  cancel: boolean
}

/** Which permission the actions shown at each status need. Statuses not listed have no actions. */
const STATUS_PERMISSION: Partial<Record<WorkOrder['status'], keyof WorkOrderActionPermissions>> = {
  new_report: 'review',
  inspecting: 'inspect',
  costing: 'review',
  pending_approval: 'review',
  assigned: 'assign',
  in_progress: 'execute',
  svc_submitted: 'review',
  verified: 'review',
  signed: 'review',
  scheduled: 'review',
  on_hold: 'review',
}

const INPUT = 'block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-600/20'
const LABEL = 'mb-1 block text-sm font-medium text-gray-700'
const WARNING = 'rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800'
const IMAGE_URL_PATTERN = /\.(avif|gif|jpe?g|png|webp)(?:[?#]|$)/i

function isImageUrl(url: string) {
  return IMAGE_URL_PATTERN.test(url)
}

function uploadKindLabel(url: string) {
  if (isImageUrl(url)) return 'Image'
  if (/\.pdf(?:[?#]|$)/i.test(url)) return 'PDF'
  if (/\.(mov|mp4|mpeg|webm)(?:[?#]|$)/i.test(url)) return 'Video'
  return 'File'
}

/** The action form of the current workflow step, shown inside the current step's card. */
export default function WorkOrderActions({ workOrder, engineers = [], slug: _slug, permissions, existingCosting = null, existingEvidence = null, jobSummary = {} }: WorkOrderActionsProps) {
  const router = useRouter()
  const formId = useId()
  /** The API path of the request in flight; every action is disabled meanwhile. */
  const [pending, setPending] = useState<string | null>(null)
  const loading = pending !== null
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [inspectionNotes, setInspectionNotes] = useState('')
  const [rootCause, setRootCause] = useState('')
  const [scopeOfWork, setScopeOfWork] = useState('')
  const [inspectionOutcome, setInspectionOutcome] = useState<InspectionOutcome>('proceed')
  const [inspectionPriority, setInspectionPriority] = useState<Priority | ''>(workOrder.priority ?? '')
  const [contractorName, setContractorName] = useState('')
  const [contractorContact, setContractorContact] = useState('')
  const [contractorNotes, setContractorNotes] = useState('')
  const [inspectionCancelReason, setInspectionCancelReason] = useState('')

  const isThirdParty = workOrder.execution_mode === 'third_party'
  const blankCostingItem = (): CostingLineItem => ({
    description: '', qty: 1, unit: '', unit_cost: 0, provided_by: isThirdParty ? 'contractor' : 'engineering',
  })
  const [labourHours, setLabourHours] = useState(Number(existingCosting?.labour_hours ?? 0))
  const [labourRate, setLabourRate] = useState(Number(existingCosting?.labour_rate ?? 0))
  const [costingItems, setCostingItems] = useState<CostingLineItem[]>(() => {
    const saved = costingToLineItems(existingCosting)
    return saved.length > 0 ? saved : [blankCostingItem()]
  })
  const [costingNotes, setCostingNotes] = useState(existingCosting?.notes ?? '')
  const [selectedCostingTenantId, setSelectedCostingTenantId] = useState('')
  const [costingModalOpen, setCostingModalOpen] = useState(false)

  const [assignEngineerId, setAssignEngineerId] = useState('')
  const [dueDate, setDueDate] = useState(() => suggestDueDate(workOrder.priority))
  const [assignInstructions, setAssignInstructions] = useState('')

  // Work sent back for rework starts from what was submitted before
  const [workDescription, setWorkDescription] = useState(existingEvidence?.work_description ?? '')
  const [hoursLogged, setHoursLogged] = useState(workOrder.hours_logged != null ? String(workOrder.hours_logged) : '')
  const [uploadedPhotoUrls, setUploadedPhotoUrls] = useState<string[]>(() => [
    ...(existingEvidence?.completion_photo_urls ?? []),
    ...(existingEvidence?.supporting_doc_urls ?? []),
  ])
  const [uploadLoading, setUploadLoading] = useState(false)

  const [verifyNotes, setVerifyNotes] = useState('')
  const [verifyNoteError, setVerifyNoteError] = useState<string | null>(null)
  const verifyNotesRef = useRef<HTMLTextAreaElement>(null)
  const [verifyTenantId, setVerifyTenantId] = useState('')

  const [assignInspectionTeamId, setAssignInspectionTeamId] = useState('')
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assignPriority, setAssignPriority] = useState<Priority>(workOrder.priority ?? 'medium')

  const { status } = workOrder
  const api = (action: string) => `/api/work-orders/${workOrder.id}/${action}`
  const { materialsTotal, subcontractorTotal } = summarizeLineItems(costingItems)
  const costingTotal = roundMoney(labourHours * labourRate + materialsTotal + subcontractorTotal)
  function updateCostingItem(index: number, patch: Partial<CostingLineItem>) {
    setCostingItems((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }
  function removeCostingItem(index: number) {
    setCostingItems((items) => items.filter((_, i) => i !== index))
  }
  function addCostingItem() {
    setCostingItems((items) => [...items, blankCostingItem()])
  }
  const getRoleName = (roles: unknown): string => {
    if (!roles) return ''
    if (Array.isArray(roles)) return normalizeRoleName((roles as Array<{ name?: string }>)[0]?.name)
    return normalizeRoleName((roles as { name?: string })?.name)
  }
  const tenants = engineers.filter(e => getRoleName(e.roles) === 'tenant' && e.is_active)
  const serviceGroup = engineers.filter(e => getRoleName(e.roles) === 'service_group' && e.is_active)

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploadLoading(true)
    const urls: string[] = []
    for (const file of files) {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(api('upload'), { method: 'POST', body: fd })
      const data = await res.json()
      if (res.ok && data.url) urls.push(data.url)
    }
    setUploadedPhotoUrls(prev => [...prev, ...urls])
    setUploadLoading(false)
    e.target.value = ''
  }

  async function apiPost(path: string, body: Record<string, unknown>) {
    setPending(path)
    setMessage(null)
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setPending(null)
    if (!res.ok) {
      setMessage({ type: 'error', text: data.error ?? 'Action failed.' })
      return false
    }
    router.refresh()
    return true
  }

  async function handleStatusChange(newStatus: string) {
    await apiPost(api('status'), { status: newStatus })
  }

  async function handleSendSignOff() {
    const ok = await apiPost(api('send-sign-off'), {})
    if (ok) setMessage({ type: 'success', text: 'Sign-off link sent to tenant.' })
  }

  function submitEvidence() {
    if (!workDescription.trim()) { setMessage({ type: 'error', text: 'Describe the work that was done.' }); return }
    const hours = hoursLogged.trim() ? Number(hoursLogged) : null
    if (hours !== null && (!Number.isFinite(hours) || hours < 0 || hours > 10000)) {
      setMessage({ type: 'error', text: 'Hours logged must be a number between 0 and 10,000.' })
      return
    }
    void apiPost(api('complete-evidence'), {
      workDescription,
      completionPhotoUrls: uploadedPhotoUrls.filter(isImageUrl),
      supportingDocUrls: uploadedPhotoUrls.filter((url) => !isImageUrl(url)),
      // Leave hours out when blank so an earlier value is not saved as 0
      ...(hours !== null ? { hoursLogged: hours } : {}),
    })
  }

  async function approveVerification() {
    const t = engineers.find(e => e.id === verifyTenantId)
    if (!workOrder.tenant_email && !t) { setMessage({ type: 'error', text: 'Please select the tenant who will sign off.' }); return }
    await apiPost(api('verify'), { notes: verifyNotes, tenantEmail: t?.email, tenantName: t?.full_name })
  }

  async function sendBackVerification() {
    if (!verifyNotes.trim()) {
      setVerifyNoteError('Add a note so the engineer knows what to fix.')
      verifyNotesRef.current?.focus()
      return
    }
    await apiPost(api('send-back'), { reason: verifyNotes })
  }

  const requiredPermission = STATUS_PERMISSION[status]
  if (requiredPermission && !permissions[requiredPermission]) {
    return (
      <p className="text-sm text-gray-500">
        You can view this work order. Actions at this stage are handled by the property team.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {message && (
        <div
          role={message.type === 'error' ? 'alert' : 'status'}
          className={`rounded-lg px-3 py-2 text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}
        >
          {message.text}
        </div>
      )}

      {status === 'new_report' && (
        <div className="space-y-4">
          {serviceGroup.length === 0 ? (
            <p className={WARNING}>No service group members found. Add a member with the &ldquo;Service Group&rdquo; role first.</p>
          ) : (
            <div>
              <label htmlFor={`${formId}-inspector`} className={LABEL}>Inspection team</label>
              <select id={`${formId}-inspector`} value={assignInspectionTeamId} onChange={(e) => setAssignInspectionTeamId(e.target.value)} className={INPUT}>
                <option value="">Select a service team member…</option>
                {serviceGroup.map((eng) => (
                  <option key={eng.id} value={eng.id}>{eng.full_name}</option>
                ))}
              </select>
            </div>
          )}
          <ActionRow>
            <ActionButton
              onClick={async () => {
                if (!assignInspectionTeamId) { setMessage({ type: 'error', text: 'Please select a service team member.' }); return }
                await apiPost(api('start-inspection'), { engineerId: assignInspectionTeamId })
              }}
              disabled={loading}
              busy={loading}
              icon={UserCheck}
              label="Assign & Start Inspection"
            />
          </ActionRow>
        </div>
      )}

      {status === 'inspecting' && (
        <div className="space-y-4">
          <div>
            <label htmlFor={`${formId}-findings`} className={LABEL}>Inspection notes</label>
            <textarea id={`${formId}-findings`} value={inspectionNotes} onChange={(e) => setInspectionNotes(e.target.value)} placeholder="Findings and diagnosis…" rows={3} className={INPUT} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${formId}-root-cause`} className={LABEL}>Root cause</label>
              <input id={`${formId}-root-cause`} type="text" value={rootCause} onChange={(e) => setRootCause(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label htmlFor={`${formId}-priority`} className={LABEL}>Priority <span className="text-red-600" aria-hidden="true">*</span></label>
              <select id={`${formId}-priority`} required value={inspectionPriority} onChange={(e) => setInspectionPriority(e.target.value as Priority | '')} className={INPUT}>
                <option value="">Select priority…</option>
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{priorityOptionLabel(option)}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor={`${formId}-scope`} className={LABEL}>Scope of work</label>
            <textarea id={`${formId}-scope`} value={scopeOfWork} onChange={(e) => setScopeOfWork(e.target.value)} placeholder="Work required to fix the issue…" rows={2} className={INPUT} />
          </div>

          <fieldset className="space-y-2">
            <legend className={LABEL}>Inspection outcome</legend>
            <OutcomeOption
              name={`${formId}-outcome`}
              checked={inspectionOutcome === 'proceed'}
              onSelect={() => setInspectionOutcome('proceed')}
              title="Proceed to costing"
              description="In-house team does the work."
            />
            <OutcomeOption
              name={`${formId}-outcome`}
              checked={inspectionOutcome === 'third_party'}
              onSelect={() => setInspectionOutcome('third_party')}
              title="Third-party contractor will do the work"
              description="Record the contractor, then continue to costing and tenant approval."
            />
            {permissions.cancel && (
              <OutcomeOption
                name={`${formId}-outcome`}
                checked={inspectionOutcome === 'cancel'}
                onSelect={() => setInspectionOutcome('cancel')}
                title="Cancel request"
                description="Close this report. The tenant is notified."
                tone="danger"
              />
            )}
          </fieldset>

          {inspectionOutcome === 'third_party' && (
            <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
              <div>
                <label htmlFor={`${formId}-contractor`} className={LABEL}>Contractor / company name <span className="text-red-600" aria-hidden="true">*</span></label>
                <input id={`${formId}-contractor`} type="text" value={contractorName} onChange={(e) => setContractorName(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label htmlFor={`${formId}-contractor-contact`} className={LABEL}>Contact person, phone or email</label>
                <input id={`${formId}-contractor-contact`} type="text" value={contractorContact} onChange={(e) => setContractorContact(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label htmlFor={`${formId}-contractor-notes`} className={LABEL}>Notes</label>
                <textarea id={`${formId}-contractor-notes`} value={contractorNotes} onChange={(e) => setContractorNotes(e.target.value)} placeholder="Scope handed over, quote reference…" rows={2} className={INPUT} />
              </div>
            </div>
          )}

          {inspectionOutcome === 'cancel' ? (
            <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <div>
                <label htmlFor={`${formId}-cancel-reason`} className={LABEL}>Reason for cancelling (shown to the tenant)</label>
                <textarea id={`${formId}-cancel-reason`} value={inspectionCancelReason} onChange={(e) => setInspectionCancelReason(e.target.value)} rows={2} className={INPUT} />
              </div>
              <ActionRow>
                <ActionButton
                  onClick={() => {
                    if (!inspectionCancelReason.trim()) { setMessage({ type: 'error', text: 'Please enter a cancellation reason.' }); return }
                    void apiPost(api('cancel'), { reason: inspectionCancelReason })
                  }}
                  disabled={loading} busy={loading} icon={Ban} label="Cancel Request" variant="danger"
                />
              </ActionRow>
            </div>
          ) : (
            <ActionRow>
              <ActionButton
                onClick={() => {
                  if (!inspectionPriority) { setMessage({ type: 'error', text: 'Please select the priority.' }); return }
                  void apiPost(api('inspection'), {
                    inspectionNotes,
                    rootCause,
                    scopeOfWork,
                    priority: inspectionPriority,
                    outcome: inspectionOutcome,
                    contractorName,
                    contractorContact,
                    contractorNotes,
                  })
                }}
                disabled={loading} busy={loading} icon={ClipboardCheck}
                label={inspectionOutcome === 'third_party' ? 'Submit Inspection → Costing (Third-Party)' : 'Submit Inspection → Proceed to Costing'}
              />
            </ActionRow>
          )}
        </div>
      )}

      {status === 'costing' && (
        <>
          <div className="space-y-4">
            {isThirdParty && <ContractorBanner workOrder={workOrder} hint="Add the contractor's quote as an item provided by the third-party contractor." />}
            <ActionRow>
              <ActionButton
                onClick={() => setCostingModalOpen(true)}
                disabled={loading}
                icon={Calculator}
                label={workOrder.rejection_reason ? 'Revise Cost Estimate' : 'Prepare Cost Estimate'}
              />
            </ActionRow>
          </div>

          {/* Modal */}
          {costingModalOpen && (
            typeof document !== 'undefined' && createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { if (!loading) setCostingModalOpen(false) }} />
              <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{workOrder.rejection_reason ? 'Revise Cost Estimate' : 'Prepare Cost Estimate'}</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Build a cost breakdown and send it to the tenant for approval.</p>
                  </div>
                  <button
                    onClick={() => { if (!loading) setCostingModalOpen(false) }}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Body — scrollable */}
                <div className="px-6 py-5 space-y-6 overflow-y-auto">
                  {message && (
                    <div className={`rounded-lg px-3 py-2 text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                      {message.text}
                    </div>
                  )}
                  {workOrder.rejection_reason && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                      <p className="font-medium">Tenant rejected the previous estimate</p>
                      <p className="mt-0.5 text-xs">{workOrder.rejection_reason}</p>
                    </div>
                  )}
                  {isThirdParty && <ContractorBanner workOrder={workOrder} hint="Add the contractor's quote as an item provided by the third-party contractor." />}

                  {/* Labour */}
                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Labour</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Labour Hours</label>
                        <input type="number" value={labourHours} onChange={(e) => setLabourHours(Number(e.target.value))} min={0} step={0.5} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Rate (₱ / hour)</label>
                        <input type="number" value={labourRate} onChange={(e) => setLabourRate(Number(e.target.value))} min={0} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 text-right">Labour subtotal: ₱{(labourHours * labourRate).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                  </section>

                  {/* Materials, Tools & Labor items */}
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Materials, Tools &amp; Labor</h3>
                      <span className="text-xs text-gray-400">{costingItems.length} item{costingItems.length === 1 ? '' : 's'}</span>
                    </div>
                    <div className="space-y-3">
                      {costingItems.map((item, index) => (
                        <div key={index} className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2.5">
                          <div className="flex items-start gap-2">
                            <span className="mt-7 w-5 shrink-0 text-center text-xs font-medium text-gray-400">{index + 1}</span>
                            <div className="flex-1">
                              <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                              <input type="text" value={item.description} onChange={(e) => updateCostingItem(index, { description: e.target.value })} placeholder="e.g. Compressor belt" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500" />
                            </div>
                            <button type="button" onClick={() => removeCostingItem(index)} className="mt-6 shrink-0 rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove item ${index + 1}`}>
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-2.5 pl-7">
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Qty</label>
                              <input type="number" value={item.qty} onChange={(e) => updateCostingItem(index, { qty: Number(e.target.value) })} min={0} step="any" aria-label="Quantity" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Unit</label>
                              <input type="text" value={item.unit ?? ''} onChange={(e) => updateCostingItem(index, { unit: e.target.value })} placeholder="pcs" aria-label="Unit" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Unit Cost (₱)</label>
                              <input type="number" value={item.unit_cost} onChange={(e) => updateCostingItem(index, { unit_cost: Number(e.target.value) })} min={0} aria-label="Unit cost" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500" />
                            </div>
                          </div>
                          <div className="flex items-end justify-between gap-2.5 pl-7">
                            <div className="flex-1">
                              <label className="block text-xs font-medium text-gray-500 mb-1">Provided By</label>
                              <select value={item.provided_by ?? 'engineering'} onChange={(e) => updateCostingItem(index, { provided_by: e.target.value as ProvidedBy })} aria-label="Provided by" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
                                {PROVIDED_BY_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </div>
                            <span className={`shrink-0 pb-2 text-sm font-semibold ${item.provided_by === 'tenant' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                              ₱{lineItemTotal(item).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      ))}
                      <button type="button" onClick={addCostingItem} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-600 hover:border-green-500 hover:text-green-700 transition-colors">
                        <Plus className="h-4 w-4" /> Add item
                      </button>
                    </div>
                    {costingItems.some((item) => item.provided_by === 'tenant') && (
                      <p className="text-xs text-gray-400">Items provided by the tenant are listed on the form but not included in the total.</p>
                    )}
                  </section>

                  {/* Estimated total summary */}
                  <section className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 space-y-1">
                    <div className="flex items-center justify-between text-xs text-green-800">
                      <span>Labour ({labourHours}h × ₱{labourRate}/h)</span>
                      <span>₱{(labourHours * labourRate).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-green-800">
                      <span>Materials &amp; items</span>
                      <span>₱{materialsTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {subcontractorTotal > 0 && (
                      <div className="flex items-center justify-between text-xs text-green-800">
                        <span>Subcontractor</span>
                        <span>₱{subcontractorTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-green-200 text-sm font-bold text-green-900">
                      <span>Estimated Total</span>
                      <span>₱{costingTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </section>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes</label>
                    <textarea value={costingNotes} onChange={(e) => setCostingNotes(e.target.value)} placeholder="Any notes for the tenant or internal record…" rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
                  </div>

                  {/* Send to tenant */}
                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Send Approval To</h3>
                    {tenants.length === 0 ? (
                      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">No tenant-role members found. Add a member with the &ldquo;Tenant&rdquo; role first.</p>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tenant <span className="text-red-500">*</span></label>
                        <select value={selectedCostingTenantId} onChange={(e) => setSelectedCostingTenantId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                          <option value="">— Select tenant —</option>
                          {tenants.map((t) => (
                            <option key={t.id} value={t.id}>{t.full_name} ({t.email})</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </section>

                  <div className="pt-2 border-t border-gray-100">
                    <CancelRequestPanel
                      loading={loading}
                      hint="Cost not approved? Cancel this request. The tenant is notified and any approval link stops working."
                      onConfirm={async (reason) => {
                        const ok = await apiPost(api('cancel'), { reason })
                        if (ok) setCostingModalOpen(false)
                      }}
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
                  <button
                    type="button"
                    onClick={() => setCostingModalOpen(false)}
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={async () => {
                      if (!selectedCostingTenantId) { setMessage({ type: 'error', text: 'Please select a tenant to send the approval to.' }); return }
                      const t = tenants.find(e => e.id === selectedCostingTenantId)
                      const ok = await apiPost(api('costing'), { labourHours, labourRate, lineItems: costingItems, notes: costingNotes, tenantEmail: t?.email ?? '', tenantName: t?.full_name ?? '' })
                      if (ok) setCostingModalOpen(false)
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-700 hover:bg-green-800 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    {loading ? 'Sending…' : 'Send Cost Approval to Tenant'}
                  </button>
                </div>
              </div>
            </div>,
            document.body
            )
          )}
        </>
      )}

      {status === 'pending_approval' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">An approval link was sent to the tenant. The work can be assigned once they approve the estimate.</p>
          <CancelRequestPanel
            loading={loading}
            hint="Tenant has not approved the cost? Cancel the request. The approval link stops working and the tenant is notified."
            onConfirm={(reason) => apiPost(api('cancel'), { reason })}
          />
        </div>
      )}

      {status === 'assigned' && (
        <>
          <ActionRow>
            <ActionButton
              onClick={() => {
                setAssignPriority(workOrder.priority ?? 'medium')
                setDueDate(suggestDueDate(workOrder.priority))
                setAssignModalOpen(true)
              }}
              disabled={loading}
              icon={UserCheck}
              label="Assign & Start Work"
            />
          </ActionRow>

          {/* Modal */}
          {assignModalOpen && (
            typeof document !== 'undefined' && createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { if (!loading) setAssignModalOpen(false) }} />
              <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Assign Work Order</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Fill in the details below to assign and start work.</p>
                  </div>
                  <button
                    onClick={() => { if (!loading) setAssignModalOpen(false) }}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Form body — mirrors New Work Order form layout */}
                <div className="px-6 py-5 space-y-5">
                  {message && (
                    <div className={`rounded-lg px-3 py-2 text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                      {message.text}
                    </div>
                  )}
                  {workOrder.costing_approved_by_name && (
                    <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700">
                      Cost approved by {workOrder.costing_approved_by_name}
                      {workOrder.costing_approved_at && ` on ${formatPHT(workOrder.costing_approved_at)}`}
                    </div>
                  )}
                  {workOrder.wo_number.startsWith('REPT-') && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
                      On assignment this report will be converted to a Work Order with a new WO number. Original: <strong>{workOrder.wo_number}</strong>
                    </div>
                  )}

                  {/* Row 1: WO Number + Type */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">WO Number</label>
                      <input
                        type="text"
                        value={workOrder.wo_number}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                      <input
                        type="text"
                        value={workOrder.type}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500 capitalize cursor-not-allowed"
                      />
                    </div>
                  </div>

                  {/* Job Summary — read-only context from the originating report, so the assigner doesn't need to leave the modal */}
                  {(jobSummary.location || jobSummary.requestedBy || jobSummary.reportedIssue || jobSummary.approvedCost != null) && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 space-y-1 text-xs text-gray-600">
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Job Summary</p>
                      {jobSummary.location && (
                        <p><span className="font-medium text-gray-700">Location:</span> {jobSummary.location}</p>
                      )}
                      {jobSummary.requestedBy && (
                        <p><span className="font-medium text-gray-700">Requested by:</span> {jobSummary.requestedBy}</p>
                      )}
                      {jobSummary.reportedIssue && (
                        <p className="line-clamp-2"><span className="font-medium text-gray-700">Issue:</span> {jobSummary.reportedIssue}</p>
                      )}
                      {jobSummary.approvedCost != null && (
                        <p><span className="font-medium text-gray-700">Approved cost:</span> ₱{jobSummary.approvedCost.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                      )}
                    </div>
                  )}

                  {/* Assign Service Team Member */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Assign Service Team Member <span className="text-red-500">*</span></label>
                    <select value={assignEngineerId} onChange={(e) => setAssignEngineerId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                      <option value="">— Select team member —</option>
                      {serviceGroup.length === 0 && <option disabled>No service group members found</option>}
                      {serviceGroup.map((eng) => (
                        <option key={eng.id} value={eng.id}>{eng.full_name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Row 2: Priority + Due Date */}
                  {isThirdParty && <ContractorBanner workOrder={workOrder} hint="The contractor carries out the work; assign a team member to coordinate." />}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                      <select
                        value={assignPriority}
                        onChange={(e) => {
                          const next = e.target.value as Priority
                          setAssignPriority(next)
                          setDueDate(suggestDueDate(next))
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        {PRIORITY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{priorityOptionLabel(option)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                      <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                      {!dueDate && assignPriority === 'low' && (
                        <p className="mt-1 text-xs text-gray-400">Low priority: schedule a date within the month.</p>
                      )}
                    </div>
                  </div>

                  {/* Assignment Instructions / Notes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Assignment Instructions</label>
                    <textarea
                      value={assignInstructions}
                      onChange={(e) => setAssignInstructions(e.target.value)}
                      placeholder="Additional notes or instructions..."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setAssignModalOpen(false)}
                      disabled={loading}
                      className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={async () => {
                        const ok = await apiPost(api('assign'), { engineerId: assignEngineerId, dueDate, instructions: assignInstructions, priority: assignPriority })
                        if (ok) setAssignModalOpen(false)
                      }}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-700 hover:bg-green-800 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <UserCheck className="w-4 h-4" />
                      {loading ? 'Assigning…' : 'Assign Work Order'}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
            )
          )}
        </>
      )}

      {status === 'in_progress' && (
        <div className="space-y-4">
          <div>
            <label htmlFor={`${formId}-work-done`} className={LABEL}>Work done <span className="text-red-600" aria-hidden="true">*</span></label>
            <textarea id={`${formId}-work-done`} required value={workDescription} onChange={(e) => setWorkDescription(e.target.value)} placeholder="Describe what was done…" rows={3} className={INPUT} />
          </div>
          <div className="sm:max-w-[12rem]">
            <label htmlFor={`${formId}-hours`} className={LABEL}>Hours logged <span className="font-normal text-gray-500">(optional)</span></label>
            <input
              id={`${formId}-hours`}
              type="number"
              inputMode="decimal"
              min={0}
              max={10000}
              step={0.25}
              value={hoursLogged}
              onChange={(e) => setHoursLogged(e.target.value)}
              className={INPUT}
            />
          </div>

          {/* File / photo upload */}
          <div>
            <p className={LABEL}>Photos and files</p>
            <label className={`inline-flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm transition-colors focus-within:ring-2 focus-within:ring-green-600 hover:border-green-600 hover:text-green-700 ${uploadLoading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer text-gray-600'}`}>
              <Paperclip className="h-4 w-4" aria-hidden="true" />
              {uploadLoading ? 'Uploading…' : 'Attach files'}
              <input type="file" multiple accept="image/*,video/*,application/pdf" onChange={handleFileUpload} className="sr-only" disabled={uploadLoading} />
            </label>
            {uploadedPhotoUrls.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {uploadedPhotoUrls.map((url, i) => (
                  <div key={`${i}-${url}`} className="group relative">
                    {isImageUrl(url) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt={`Upload ${i + 1}`} className="h-16 w-16 rounded-lg border border-gray-200 object-cover" />
                    ) : (
                      <div className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-1 text-center text-[10px] font-medium text-gray-500">
                        <Paperclip className="h-4 w-4" aria-hidden="true" />
                        <span className="truncate">{uploadKindLabel(url)}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setUploadedPhotoUrls(prev => prev.filter((_, j) => j !== i))}
                      aria-label={`Remove file ${i + 1}`}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                    ><X className="h-3 w-3" aria-hidden="true" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-gray-500">
            After you submit, the head engineer does the final verification. The tenant sign-off link is sent once the work is verified.
          </p>
          <ActionRow>
            <ActionButton onClick={submitEvidence} disabled={loading || uploadLoading} busy={loading} icon={Send} label="Submit for Final Verification" />
          </ActionRow>
        </div>
      )}

      {status === 'svc_submitted' && (
        <div className="space-y-4">
          <div>
            <label htmlFor={`${formId}-verify-notes`} className={LABEL}>
              Notes <span className="font-normal text-gray-500">(optional)</span>
            </label>
            <textarea
              id={`${formId}-verify-notes`}
              ref={verifyNotesRef}
              value={verifyNotes}
              onChange={(e) => { setVerifyNotes(e.target.value); if (verifyNoteError) setVerifyNoteError(null) }}
              placeholder="Anything the next person should know..."
              rows={3}
              maxLength={2000}
              aria-invalid={verifyNoteError ? true : undefined}
              aria-describedby={`${formId}-verify-hint`}
              className={cn(INPUT, 'resize-y', verifyNoteError && 'border-red-500 focus:border-red-500 focus:ring-red-500/20')}
            />
            <p id={`${formId}-verify-hint`} className={cn('mt-1 text-xs', verifyNoteError ? 'text-red-700' : 'text-gray-500')}>
              {verifyNoteError ?? 'Required to send the work back; the assigned engineer sees it.'}
            </p>
          </div>
          {!workOrder.tenant_email && (
            tenants.length === 0 ? (
              <p className={WARNING}>No tenant-role members found. Add a member with the &ldquo;Tenant&rdquo; role first.</p>
            ) : (
              <div>
                <label htmlFor={`${formId}-sign-off-tenant`} className={LABEL}>Tenant who signs off</label>
                <select id={`${formId}-sign-off-tenant`} value={verifyTenantId} onChange={(e) => setVerifyTenantId(e.target.value)} className={INPUT}>
                  <option value="">Select a tenant…</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.full_name} ({t.email})</option>
                  ))}
                </select>
              </div>
            )
          )}
          <ActionRow>
            <ActionButton
              onClick={approveVerification}
              disabled={loading}
              busy={pending === api('verify')}
              icon={Check}
              label="Approve & send to tenant for sign-off"
            />
            <ActionButton
              onClick={sendBackVerification}
              disabled={loading}
              busy={pending === api('send-back')}
              icon={Undo2}
              label="Send back to Work Execution"
              variant="outline"
            />
          </ActionRow>
        </div>
      )}

      {status === 'verified' && (
        <ActionRow>
          <ActionButton onClick={handleSendSignOff} disabled={loading} busy={loading} icon={Send} label="Resend Sign-Off Link" variant="outline" />
        </ActionRow>
      )}

      {status === 'signed' && (
        <div className="space-y-4">
          <div>
            <label htmlFor={`${formId}-legacy-notes`} className={LABEL}>
              Notes <span className="font-normal text-gray-500">(optional)</span>
            </label>
            <textarea id={`${formId}-legacy-notes`} value={verifyNotes} onChange={(e) => setVerifyNotes(e.target.value)} rows={3} className={cn(INPUT, 'resize-y')} />
          </div>
          <ActionRow>
            <ActionButton onClick={() => apiPost(api('verify'), { notes: verifyNotes })} disabled={loading} busy={loading} icon={ClipboardCheck} label="Approve & Complete" />
          </ActionRow>
        </div>
      )}

      {status === 'scheduled' && (
        <ActionRow>
          <ActionButton onClick={() => handleStatusChange('in_progress')} disabled={loading} busy={loading} icon={RefreshCw} label="Mark In Progress" />
        </ActionRow>
      )}
      {status === 'on_hold' && (
        <ActionRow>
          <ActionButton onClick={() => handleStatusChange('in_progress')} disabled={loading} busy={loading} icon={RefreshCw} label="Resume Work" />
        </ActionRow>
      )}
    </div>
  )
}

function ActionRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">{children}</div>
}

function ActionButton({ onClick, disabled = false, busy = false, icon: Icon, label, variant = 'primary' }: {
  onClick: () => void
  disabled?: boolean
  /** Shows "Please wait…" on the button whose request is in flight. */
  busy?: boolean
  icon: React.ElementType
  label: string
  variant?: 'primary' | 'outline' | 'danger'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed sm:w-auto',
        variant === 'primary' && 'bg-green-700 text-white hover:bg-green-800 focus-visible:ring-green-600 disabled:bg-green-700/60',
        variant === 'outline' && 'border border-gray-300 bg-white text-gray-800 shadow-sm hover:bg-gray-50 focus-visible:ring-green-600 disabled:opacity-60',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600 disabled:bg-red-600/60'
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {busy ? 'Please wait…' : label}
    </button>
  )
}

function OutcomeOption({ name, checked, onSelect, title, description, tone }: {
  name: string; checked: boolean; onSelect: () => void; title: string; description: string; tone?: 'danger'
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors focus-within:ring-2 focus-within:ring-green-600 ${
        checked
          ? tone === 'danger' ? 'border-red-400 bg-red-50' : 'border-green-600 bg-green-50'
          : 'border-gray-200 hover:bg-gray-50'
      }`}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="mt-1 accent-green-700" />
      <span className="min-w-0">
        <span className={`block text-sm font-medium ${tone === 'danger' ? 'text-red-800' : 'text-gray-900'}`}>{title}</span>
        <span className="block text-xs text-gray-500">{description}</span>
      </span>
    </label>
  )
}

function ContractorBanner({ workOrder, hint }: { workOrder: WorkOrder; hint: string }) {
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
      <p className="font-semibold">Third-party contractor: {workOrder.contractor_name ?? '—'}</p>
      {workOrder.contractor_contact && <p className="mt-0.5">{workOrder.contractor_contact}</p>}
      {workOrder.contractor_notes && <p className="mt-0.5 italic">{workOrder.contractor_notes}</p>}
      <p className="mt-1 text-indigo-700">{hint}</p>
    </div>
  )
}

function CancelRequestPanel({ loading, hint, onConfirm }: {
  loading: boolean; hint: string; onConfirm: (reason: string) => void | Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const reasonId = useId()

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 sm:w-auto"
      >
        <Ban className="h-4 w-4" aria-hidden="true" /> Cancel Request
      </button>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
      <p className="text-xs text-red-800">{hint}</p>
      <label htmlFor={reasonId} className="sr-only">Reason for cancelling</label>
      <textarea
        id={reasonId}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for cancelling (required, shown to the tenant)…"
        rows={2}
        className={INPUT}
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={loading || !reason.trim()}
          onClick={() => void onConfirm(reason)}
          className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:bg-red-300"
        >
          {loading ? 'Please wait…' : 'Confirm Cancellation'}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => { setOpen(false); setReason('') }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Keep Request
        </button>
      </div>
    </div>
  )
}
