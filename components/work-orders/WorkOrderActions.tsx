'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import type { WorkOrder, Engineer, Priority } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { Send, ExternalLink, Download, RefreshCw, ClipboardCheck, UserCheck, Paperclip, X, ArrowRight, Ban, FileDown } from 'lucide-react'
import { formatPHT } from '@/lib/utils'
import { normalizeRoleName } from '@/lib/roles'
import { PRIORITY_OPTIONS, priorityOptionLabel, suggestDueDate } from '@/lib/priority'

type InspectionOutcome = 'proceed' | 'third_party' | 'cancel'

interface Schedule {
  id: string
  title: string
  assets: { id: string; name: string } | null
}

interface WorkOrderActionsProps {
  workOrder: WorkOrder
  engineers?: Engineer[]
  schedules?: Schedule[]
  slug: string
}

const INPUT = 'w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500'
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

export default function WorkOrderActions({ workOrder, engineers = [], schedules = [], slug: _slug }: WorkOrderActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
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

  const [labourHours, setLabourHours] = useState(0)
  const [labourRate, setLabourRate] = useState(0)
  const [materialsTotal, setMaterialsTotal] = useState(0)
  const [subcontractorTotal, setSubcontractorTotal] = useState(0)
  const [costingNotes, setCostingNotes] = useState('')
  const [selectedCostingTenantId, setSelectedCostingTenantId] = useState('')

  const [assignEngineerId, setAssignEngineerId] = useState('')
  const [dueDate, setDueDate] = useState(() => suggestDueDate(workOrder.priority))
  const [assignInstructions, setAssignInstructions] = useState('')

  const [workDescription, setWorkDescription] = useState('')
  const [uploadedPhotoUrls, setUploadedPhotoUrls] = useState<string[]>([])
  const [uploadLoading, setUploadLoading] = useState(false)

  const [verifyNotes, setVerifyNotes] = useState('')
  const [verifyTenantId, setVerifyTenantId] = useState('')

  const [assignInspectionTeamId, setAssignInspectionTeamId] = useState('')
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assignPriority, setAssignPriority] = useState<Priority>(workOrder.priority ?? 'medium')
  const [assignScheduleId, setAssignScheduleId] = useState(workOrder.schedule_id ?? '')

  const { status } = workOrder
  const isThirdParty = workOrder.execution_mode === 'third_party'
  const getRoleName = (roles: unknown): string => {
    if (!roles) return ''
    if (Array.isArray(roles)) return normalizeRoleName((roles as Array<{ name?: string }>)[0]?.name)
    return normalizeRoleName((roles as { name?: string })?.name)
  }
  const tenants = engineers.filter(e => getRoleName(e.roles) === 'tenant' && e.is_active)
  const serviceGroup = engineers.filter(e => getRoleName(e.roles) === 'service group' && e.is_active)

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploadLoading(true)
    const urls: string[] = []
    for (const file of files) {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/work-orders/${workOrder.id}/upload`, { method: 'POST', body: fd })
      const data = await res.json()
      if (res.ok && data.url) urls.push(data.url)
    }
    setUploadedPhotoUrls(prev => [...prev, ...urls])
    setUploadLoading(false)
    e.target.value = ''
  }

  async function apiPost(path: string, body: Record<string, unknown>) {
    setLoading(true)
    setMessage(null)
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) {
      setMessage({ type: 'error', text: data.error ?? 'Action failed.' })
      setLoading(false)
      return false
    }
    setLoading(false)
    router.refresh()
    return true
  }

  async function handleStatusChange(newStatus: string) {
    setLoading(true)
    setMessage(null)
    const supabase = createClient()
    const { error } = await supabase
      .from('work_orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', workOrder.id)
    if (error) setMessage({ type: 'error', text: error.message })
    else router.refresh()
    setLoading(false)
  }

  async function handleSendSignOff() {
    const ok = await apiPost(`/api/work-orders/${workOrder.id}/send-sign-off`, {})
    if (ok) setMessage({ type: 'success', text: 'Sign-off link sent to tenant.' })
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
      <h3 className="font-semibold text-gray-900 text-sm">Actions</h3>

      {message && (
        <div className={`rounded-lg px-3 py-2 text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      {status === 'new_report' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Assign Inspection Team</p>
          {serviceGroup.length === 0 ? (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">No service group members found. Add a member with the &ldquo;Service Group&rdquo; role first.</p>
          ) : (
            <select value={assignInspectionTeamId} onChange={(e) => setAssignInspectionTeamId(e.target.value)} className={INPUT}>
              <option value="">Select service team member...</option>
              {serviceGroup.map((eng) => (
                <option key={eng.id} value={eng.id}>{eng.full_name}</option>
              ))}
            </select>
          )}
          <ActionButton
            onClick={async () => {
              if (!assignInspectionTeamId) { setMessage({ type: 'error', text: 'Please select a service team member.' }); return }
              await apiPost(`/api/work-orders/${workOrder.id}/start-inspection`, { engineerId: assignInspectionTeamId })
            }}
            loading={loading}
            icon={UserCheck}
            label="Assign & Start Inspection"
          />
        </div>
      )}

      {status === 'inspecting' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Record Inspection Findings</p>
          <textarea value={inspectionNotes} onChange={(e) => setInspectionNotes(e.target.value)} placeholder="Inspection notes & diagnosis…" rows={2} className={INPUT} />
          <input type="text" value={rootCause} onChange={(e) => setRootCause(e.target.value)} placeholder="Root cause" className={INPUT} />
          <textarea value={scopeOfWork} onChange={(e) => setScopeOfWork(e.target.value)} placeholder="Scope of work required…" rows={2} className={INPUT} />

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Priority (assessed by engineer) <span className="text-red-500">*</span></label>
            <select value={inspectionPriority} onChange={(e) => setInspectionPriority(e.target.value as Priority | '')} className={INPUT}>
              <option value="">— Select priority —</option>
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{priorityOptionLabel(option)}</option>
              ))}
            </select>
          </div>

          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide pt-1">Inspection Outcome</p>
          <div className="space-y-2">
            <OutcomeOption
              checked={inspectionOutcome === 'proceed'}
              onSelect={() => setInspectionOutcome('proceed')}
              title="Proceed to costing"
              description="In-house team does the work."
            />
            <OutcomeOption
              checked={inspectionOutcome === 'third_party'}
              onSelect={() => setInspectionOutcome('third_party')}
              title="Third-party contractor will do the work"
              description="Record the contractor, then continue to costing and tenant approval."
            />
            <OutcomeOption
              checked={inspectionOutcome === 'cancel'}
              onSelect={() => setInspectionOutcome('cancel')}
              title="Cancel request"
              description="Close this report. The tenant is notified."
              tone="danger"
            />
          </div>

          {inspectionOutcome === 'third_party' && (
            <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
              <input type="text" value={contractorName} onChange={(e) => setContractorName(e.target.value)} placeholder="Contractor / company name *" className={INPUT} />
              <input type="text" value={contractorContact} onChange={(e) => setContractorContact(e.target.value)} placeholder="Contact person, phone or email" className={INPUT} />
              <textarea value={contractorNotes} onChange={(e) => setContractorNotes(e.target.value)} placeholder="Notes (scope handed over, quote reference…)" rows={2} className={INPUT} />
            </div>
          )}

          {inspectionOutcome === 'cancel' ? (
            <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <textarea value={inspectionCancelReason} onChange={(e) => setInspectionCancelReason(e.target.value)} placeholder="Reason for cancelling (required, shown to the tenant)…" rows={2} className={INPUT} />
              <ActionButton
                onClick={() => {
                  if (!inspectionCancelReason.trim()) { setMessage({ type: 'error', text: 'Please enter a cancellation reason.' }); return }
                  void apiPost(`/api/work-orders/${workOrder.id}/cancel`, { reason: inspectionCancelReason })
                }}
                loading={loading} icon={Ban} label="Cancel Request" variant="danger"
              />
            </div>
          ) : (
            <ActionButton
              onClick={() => {
                if (!inspectionPriority) { setMessage({ type: 'error', text: 'Please select the priority.' }); return }
                void apiPost(`/api/work-orders/${workOrder.id}/inspection`, {
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
              loading={loading} icon={ClipboardCheck}
              label={inspectionOutcome === 'third_party' ? 'Submit Inspection → Costing (Third-Party)' : 'Submit Inspection → Proceed to Costing'}
            />
          )}
        </div>
      )}

      {(status === 'costing' || (status === 'pending_approval' && workOrder.rejection_reason)) && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Prepare Cost Estimate</p>
          {isThirdParty && <ContractorBanner workOrder={workOrder} hint="Enter the contractor's quote under Subcontractor." />}
          {workOrder.rejection_reason && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              Rejection reason: {workOrder.rejection_reason}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Labour Hours</label>
              <input type="number" value={labourHours} onChange={(e) => setLabourHours(Number(e.target.value))} min={0} step={0.5} className={INPUT} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Rate (₱/hr)</label>
              <input type="number" value={labourRate} onChange={(e) => setLabourRate(Number(e.target.value))} min={0} className={INPUT} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Materials (₱)</label>
              <input type="number" value={materialsTotal} onChange={(e) => setMaterialsTotal(Number(e.target.value))} min={0} className={INPUT} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{isThirdParty ? 'Contractor quote (₱)' : 'Subcontractor (₱)'}</label>
              <input type="number" value={subcontractorTotal} onChange={(e) => setSubcontractorTotal(Number(e.target.value))} min={0} className={INPUT} />
            </div>
          </div>
          <p className="text-sm font-semibold text-gray-800">
            Total: ₱{(labourHours * labourRate + materialsTotal + subcontractorTotal).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </p>
          <textarea value={costingNotes} onChange={(e) => setCostingNotes(e.target.value)} placeholder="Additional notes…" rows={2} className={INPUT} />
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide pt-1">Send approval to tenant</p>
          {tenants.length === 0 ? (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">No tenant-role members found. Add a member with the &ldquo;Tenant&rdquo; role first.</p>
          ) : (
            <select value={selectedCostingTenantId} onChange={(e) => setSelectedCostingTenantId(e.target.value)} className={INPUT}>
              <option value="">— Select tenant —</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.full_name} ({t.email})</option>
              ))}
            </select>
          )}
          <ActionButton
            onClick={() => {
              const t = engineers.find(e => e.id === selectedCostingTenantId)
              apiPost(`/api/work-orders/${workOrder.id}/costing`, { labourHours, labourRate, materialsTotal, subcontractorTotal, notes: costingNotes, tenantEmail: t?.email ?? '', tenantName: t?.full_name ?? '' })
            }}
            loading={loading} icon={Send} label="Send Cost Approval to Tenant"
          />
          <CancelRequestPanel
            loading={loading}
            hint="Cost not approved? Cancel this request. The tenant is notified and any approval link stops working."
            onConfirm={(reason) => apiPost(`/api/work-orders/${workOrder.id}/cancel`, { reason })}
          />
        </div>
      )}

      {status === 'pending_approval' && !workOrder.rejection_reason && (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
            Awaiting tenant cost approval — a link has been sent.
          </div>
          <CancelRequestPanel
            loading={loading}
            hint="Tenant has not approved the cost? Cancel the request. The approval link stops working and the tenant is notified."
            onConfirm={(reason) => apiPost(`/api/work-orders/${workOrder.id}/cancel`, { reason })}
          />
        </div>
      )}

      {status === 'assigned' && (
        <>
          {/* Trigger button shown in the Actions card */}
          <div className="space-y-3">
            {workOrder.costing_approved_by_name && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700">
                Cost approved by {workOrder.costing_approved_by_name}
                {workOrder.costing_approved_at && ` on ${formatPHT(workOrder.costing_approved_at)}`}
              </div>
            )}
            <button
              onClick={() => {
                setAssignPriority(workOrder.priority ?? 'medium')
                setDueDate(suggestDueDate(workOrder.priority))
                setAssignModalOpen(true)
              }}
              className="w-full flex items-center justify-between gap-2 bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
            >
              <span className="flex items-center gap-2"><UserCheck className="w-4 h-4" /> Assign &amp; Start Work</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

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

                  {/* PPM Schedule */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">PPM Schedule (optional)</label>
                    <select value={assignScheduleId} onChange={(e) => setAssignScheduleId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                      <option value="">— Select schedule —</option>
                      {schedules.map((s) => (
                        <option key={s.id} value={s.id}>{s.title}{s.assets ? ` (${s.assets.name})` : ''}</option>
                      ))}
                    </select>
                  </div>

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
                        const ok = await apiPost(`/api/work-orders/${workOrder.id}/assign`, { engineerId: assignEngineerId, dueDate, instructions: assignInstructions, priority: assignPriority, scheduleId: assignScheduleId || undefined })
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
        <div className="space-y-3">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Submit Completion Evidence</p>
          <textarea value={workDescription} onChange={(e) => setWorkDescription(e.target.value)} placeholder="Describe what was done…" rows={2} className={INPUT} />

          {/* File / photo upload */}
          <div>
            <label className="text-xs text-gray-500 font-medium uppercase tracking-wide block mb-1">Upload photos / files</label>
            <label className={`inline-flex items-center gap-2 px-3 py-2 text-sm border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-green-500 hover:text-green-600 transition-colors ${uploadLoading ? 'opacity-50 cursor-not-allowed' : 'text-gray-500'}`}>
              <Paperclip className="w-4 h-4" />
              {uploadLoading ? 'Uploading…' : 'Attach files'}
              <input type="file" multiple accept="image/*,video/*,application/pdf" onChange={handleFileUpload} className="hidden" disabled={uploadLoading} />
            </label>
            {uploadedPhotoUrls.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {uploadedPhotoUrls.map((url, i) => (
                  <div key={i} className="relative group">
                    {isImageUrl(url) ? (
                      <img src={url} alt={`Upload ${i + 1}`} className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                    ) : (
                      <div className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-1 text-center text-[10px] font-medium text-gray-500">
                        <Paperclip className="h-4 w-4" />
                        <span className="truncate">{uploadKindLabel(url)}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setUploadedPhotoUrls(prev => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    ><X className="w-2.5 h-2.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            After you submit, the head engineer does the final verification. The tenant sign-off link is sent once the work is verified.
          </p>
          <ActionButton
            onClick={() => {
              void apiPost(`/api/work-orders/${workOrder.id}/complete-evidence`, {
                workDescription,
                completionPhotoUrls: uploadedPhotoUrls.filter(isImageUrl),
                supportingDocUrls: uploadedPhotoUrls.filter((url) => !isImageUrl(url)),
              })
            }}
            loading={loading} icon={Send} label="Submit Evidence for Final Verification"
          />
        </div>
      )}

      {status === 'svc_submitted' && (
        <div className="space-y-3">
          <div className="bg-cyan-50 border border-cyan-200 rounded-lg px-3 py-2 text-sm text-cyan-800">
            Work submitted — awaiting final verification
          </div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Head Engineer Final Verification</p>
          <textarea value={verifyNotes} onChange={(e) => setVerifyNotes(e.target.value)} placeholder="Final verification notes (optional)…" rows={2} className={INPUT} />
          {!workOrder.tenant_email && (
            <>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide pt-1">Send sign-off to tenant</p>
              {tenants.length === 0 ? (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">No tenant-role members found. Add a member with the &ldquo;Tenant&rdquo; role first.</p>
              ) : (
                <select value={verifyTenantId} onChange={(e) => setVerifyTenantId(e.target.value)} className={INPUT}>
                  <option value="">— Select tenant —</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.full_name} ({t.email})</option>
                  ))}
                </select>
              )}
            </>
          )}
          <ActionButton
            onClick={async () => {
              const t = engineers.find(e => e.id === verifyTenantId)
              if (!workOrder.tenant_email && !t) { setMessage({ type: 'error', text: 'Please select the tenant who will sign off.' }); return }
              const ok = await apiPost(`/api/work-orders/${workOrder.id}/verify`, { notes: verifyNotes, tenantEmail: t?.email, tenantName: t?.full_name })
              if (ok) setMessage({ type: 'success', text: 'Verified. Sign-off link sent to the tenant.' })
            }}
            loading={loading} icon={ClipboardCheck} label="Approve & Send to Tenant for Sign-Off"
          />
        </div>
      )}

      {status === 'verified' && (
        <div className="space-y-2">
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm">
            <p className="font-medium text-green-800">Verified by Head Engineer</p>
            {workOrder.head_engineer_verified_at && <p className="text-green-600 text-xs mt-0.5">{formatPHT(workOrder.head_engineer_verified_at, true)}</p>}
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">Awaiting tenant sign-off</div>
          {workOrder.sign_off_token && (
            <a href={`${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')}/sign-off/${workOrder.sign_off_token}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-green-600 hover:underline">
              <ExternalLink className="w-3.5 h-3.5" /> Preview sign-off page
            </a>
          )}
          <ActionButton onClick={handleSendSignOff} loading={loading} icon={Send} label="Resend Sign-Off Link" variant="secondary" />
        </div>
      )}

      {status === 'signed' && (
        <div className="space-y-3">
          <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 text-sm">
            <p className="font-medium text-teal-800">Signed by tenant</p>
            {workOrder.signed_by_name && <p className="text-teal-700 mt-0.5">{workOrder.signed_by_name}</p>}
            {workOrder.signed_at && <p className="text-teal-600 text-xs mt-0.5">{formatPHT(workOrder.signed_at, true)}</p>}
            {workOrder.rating && <p className="text-teal-700 text-xs mt-1">Rating: {'★'.repeat(workOrder.rating)}{'☆'.repeat(5 - workOrder.rating)}</p>}
            {workOrder.rating_comment && <p className="text-teal-600 text-xs italic mt-0.5">&ldquo;{workOrder.rating_comment}&rdquo;</p>}
          </div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Head Engineer Final Verification</p>
          <textarea value={verifyNotes} onChange={(e) => setVerifyNotes(e.target.value)} placeholder="Final verification notes (optional)…" rows={2} className={INPUT} />
          <ActionButton onClick={() => apiPost(`/api/work-orders/${workOrder.id}/verify`, { notes: verifyNotes })} loading={loading} icon={ClipboardCheck} label="Approve & Complete" />
        </div>
      )}

      {status === 'completed' && (
        <div className="space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm">
            <p className="font-medium text-green-800">Work Order Completed</p>
            {workOrder.head_engineer_verified_at && <p className="text-green-600 text-xs mt-0.5">Verified {formatPHT(workOrder.head_engineer_verified_at, true)}</p>}
            {workOrder.signed_at && <p className="text-green-600 text-xs mt-0.5">Tenant signed {formatPHT(workOrder.signed_at, true)}</p>}
          </div>
          <a
            href={workOrder.audit_report_url ?? `/api/pdf/${workOrder.id}/audit`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors w-full justify-center"
          >
            <FileDown className="w-4 h-4" /> Download Audit Report
          </a>
          {workOrder.pdf_url && (
            <a href={workOrder.pdf_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 text-sm font-medium px-4 py-2 rounded-lg transition-colors w-full justify-center">
              <Download className="w-4 h-4" /> Download Signed Receipt
            </a>
          )}
        </div>
      )}

      {status === 'cancelled' && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
          <p className="font-medium text-red-800">
            Request cancelled{workOrder.cancelled_stage ? ` at ${workOrder.cancelled_stage}` : ''}
          </p>
          {workOrder.cancellation_reason && <p className="text-red-700 mt-0.5 whitespace-pre-wrap">{workOrder.cancellation_reason}</p>}
          {(workOrder.cancelled_by_name || workOrder.cancelled_at) && (
            <p className="text-red-600 text-xs mt-1">
              {workOrder.cancelled_by_name ?? ''}{workOrder.cancelled_at ? ` · ${formatPHT(workOrder.cancelled_at, true)}` : ''}
            </p>
          )}
        </div>
      )}

      {status === 'scheduled' && <ActionButton onClick={() => handleStatusChange('in_progress')} loading={loading} icon={RefreshCw} label="Mark In Progress" />}
      {status === 'on_hold' && <ActionButton onClick={() => handleStatusChange('in_progress')} loading={loading} icon={RefreshCw} label="Resume Work" />}

      {workOrder.rejection_reason && status !== 'costing' && status !== 'pending_approval' && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
          <p className="font-medium text-red-800">Last rejection reason</p>
          <p className="text-red-700 mt-0.5">{workOrder.rejection_reason}</p>
        </div>
      )}
    </div>
  )
}

function ActionButton({ onClick, loading, icon: Icon, label, variant = 'primary' }: {
  onClick: () => void; loading: boolean; icon: React.ElementType; label: string; variant?: 'primary' | 'secondary' | 'danger'
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
          className={`inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg transition-colors w-full justify-center ${
        variant === 'primary'
          ? 'bg-green-700 hover:bg-green-800 disabled:bg-green-400 text-white'
          : variant === 'danger'
          ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white'
          : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200'
      }`}
    >
      <Icon className="w-4 h-4" />
      {loading ? 'Please wait…' : label}
    </button>
  )
}

function OutcomeOption({ checked, onSelect, title, description, tone }: {
  checked: boolean; onSelect: () => void; title: string; description: string; tone?: 'danger'
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors ${
        checked
          ? tone === 'danger' ? 'border-red-400 bg-red-50' : 'border-green-500 bg-green-50'
          : 'border-gray-200 hover:bg-gray-50'
      }`}
    >
      <input type="radio" checked={checked} onChange={onSelect} className="mt-1 accent-green-700" />
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

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
      >
        <Ban className="w-4 h-4" /> Cancel Request
      </button>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
      <p className="text-xs text-red-800">{hint}</p>
      <textarea
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
