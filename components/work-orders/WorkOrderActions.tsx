'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { WorkOrder, Engineer } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { Send, ExternalLink, Download, RefreshCw, ClipboardCheck, UserCheck, Paperclip, X, ArrowRight } from 'lucide-react'
import { formatPHT } from '@/lib/utils'

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

const INPUT = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500'

export default function WorkOrderActions({ workOrder, engineers = [], schedules = [], slug: _slug }: WorkOrderActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [inspectionNotes, setInspectionNotes] = useState('')
  const [rootCause, setRootCause] = useState('')
  const [scopeOfWork, setScopeOfWork] = useState('')

  const [labourHours, setLabourHours] = useState(0)
  const [labourRate, setLabourRate] = useState(0)
  const [materialsTotal, setMaterialsTotal] = useState(0)
  const [subcontractorTotal, setSubcontractorTotal] = useState(0)
  const [costingNotes, setCostingNotes] = useState('')
  const [selectedCostingTenantId, setSelectedCostingTenantId] = useState('')

  const [assignEngineerId, setAssignEngineerId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [assignInstructions, setAssignInstructions] = useState('')

  const [workDescription, setWorkDescription] = useState('')
  const [uploadedPhotoUrls, setUploadedPhotoUrls] = useState<string[]>([])
  const [uploadLoading, setUploadLoading] = useState(false)
  const [selectedEvidenceTenantId, setSelectedEvidenceTenantId] = useState('')

  const [verifyNotes, setVerifyNotes] = useState('')

  const [assignInspectionTeamId, setAssignInspectionTeamId] = useState('')
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assignPriority, setAssignPriority] = useState<'critical' | 'high' | 'medium' | 'low'>(workOrder.priority ?? 'medium')
  const [assignScheduleId, setAssignScheduleId] = useState(workOrder.schedule_id ?? '')

  const { status } = workOrder
  const getRoleName = (roles: unknown): string => {
    if (!roles) return ''
    if (Array.isArray(roles)) return ((roles as Array<{ name?: string }>)[0]?.name ?? '').toLowerCase()
    return (((roles as { name?: string })?.name) ?? '').toLowerCase()
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
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
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
              setLoading(true); setMessage(null)
              const supabase = createClient()
              const { error } = await supabase.from('work_orders').update({ engineer_id: assignInspectionTeamId, status: 'inspecting', updated_at: new Date().toISOString() }).eq('id', workOrder.id)
              if (error) setMessage({ type: 'error', text: error.message })
              else router.refresh()
              setLoading(false)
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
          <textarea value={inspectionNotes} onChange={(e) => setInspectionNotes(e.target.value)} placeholder="Inspection notes & diagnosis…" rows={3} className={INPUT} />
          <input type="text" value={rootCause} onChange={(e) => setRootCause(e.target.value)} placeholder="Root cause" className={INPUT} />
          <textarea value={scopeOfWork} onChange={(e) => setScopeOfWork(e.target.value)} placeholder="Scope of work required…" rows={2} className={INPUT} />
          <ActionButton
            onClick={() => apiPost(`/api/work-orders/${workOrder.id}/inspection`, { inspectionNotes, rootCause, scopeOfWork })}
            loading={loading} icon={ClipboardCheck} label="Submit Inspection ? Proceed to Costing"
          />
        </div>
      )}

      {(status === 'costing' || (status === 'pending_approval' && workOrder.rejection_reason)) && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Prepare Cost Estimate</p>
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
              <label className="text-xs text-gray-500 mb-1 block">Rate (?/hr)</label>
              <input type="number" value={labourRate} onChange={(e) => setLabourRate(Number(e.target.value))} min={0} className={INPUT} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Materials (?)</label>
              <input type="number" value={materialsTotal} onChange={(e) => setMaterialsTotal(Number(e.target.value))} min={0} className={INPUT} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Subcontractor (?)</label>
              <input type="number" value={subcontractorTotal} onChange={(e) => setSubcontractorTotal(Number(e.target.value))} min={0} className={INPUT} />
            </div>
          </div>
          <p className="text-sm font-semibold text-gray-800">
            Total: ?{(labourHours * labourRate + materialsTotal + subcontractorTotal).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
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
        </div>
      )}

      {status === 'pending_approval' && !workOrder.rejection_reason && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
          Awaiting tenant cost approval — a link has been sent.
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
              onClick={() => setAssignModalOpen(true)}
              className="w-full flex items-center justify-between gap-2 bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
            >
              <span className="flex items-center gap-2"><UserCheck className="w-4 h-4" /> Assign &amp; Start Work</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Modal */}
          {assignModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                      <select value={assignPriority} onChange={(e) => setAssignPriority(e.target.value as 'critical' | 'high' | 'medium' | 'low')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                      <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
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
            </div>
          )}
        </>
      )}

      {status === 'in_progress' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Submit Completion Evidence</p>
          <textarea value={workDescription} onChange={(e) => setWorkDescription(e.target.value)} placeholder="Describe what was done…" rows={3} className={INPUT} />

          {/* File / photo upload */}
          <div>
            <label className="text-xs text-gray-500 font-medium uppercase tracking-wide block mb-1">Upload photos / files</label>
            <label className={`inline-flex items-center gap-2 px-3 py-2 text-sm border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-green-500 hover:text-green-600 transition-colors ${uploadLoading ? 'opacity-50 cursor-not-allowed' : 'text-gray-500'}`}>
              <Paperclip className="w-4 h-4" />
              {uploadLoading ? 'Uploading…' : 'Attach files'}
              <input type="file" multiple accept="image/*,application/pdf" onChange={handleFileUpload} className="hidden" disabled={uploadLoading} />
            </label>
            {uploadedPhotoUrls.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {uploadedPhotoUrls.map((url, i) => (
                  <div key={i} className="relative group">
                    <img src={url} alt={`Upload ${i + 1}`} className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
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

          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide pt-1">Send sign-off to tenant</p>
          {tenants.length === 0 ? (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">No tenant-role members found. Add a member with the &ldquo;Tenant&rdquo; role first.</p>
          ) : (
            <select value={selectedEvidenceTenantId} onChange={(e) => setSelectedEvidenceTenantId(e.target.value)} className={INPUT}>
              <option value="">— Select tenant —</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.full_name} ({t.email})</option>
              ))}
            </select>
          )}
          <ActionButton
            onClick={() => {
              const t = engineers.find(e => e.id === selectedEvidenceTenantId)
              apiPost(`/api/work-orders/${workOrder.id}/complete-evidence`, { workDescription, completionPhotoUrls: uploadedPhotoUrls, tenantEmail: t?.email ?? '', tenantName: t?.full_name ?? '' })
            }}
            loading={loading} icon={Send} label="Submit Evidence & Send Sign-Off Link"
          />
        </div>
      )}

      {status === 'svc_submitted' && (
        <div className="space-y-2">
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
          <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-3 text-sm">
            <p className="font-medium text-teal-800">Signed by tenant</p>
            {workOrder.signed_by_name && <p className="text-teal-700 mt-0.5">{workOrder.signed_by_name}</p>}
            {workOrder.signed_at && <p className="text-teal-600 text-xs mt-0.5">{formatPHT(workOrder.signed_at, true)}</p>}
            {workOrder.rating && <p className="text-teal-700 text-xs mt-1">Rating: {'?'.repeat(workOrder.rating)}{'?'.repeat(5 - workOrder.rating)}</p>}
            {workOrder.rating_comment && <p className="text-teal-600 text-xs italic mt-0.5">&ldquo;{workOrder.rating_comment}&rdquo;</p>}
          </div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Head Engineer Final Verification</p>
          <textarea value={verifyNotes} onChange={(e) => setVerifyNotes(e.target.value)} placeholder="Final verification notes (optional)…" rows={2} className={INPUT} />
          <ActionButton onClick={() => apiPost(`/api/work-orders/${workOrder.id}/verify`, { notes: verifyNotes })} loading={loading} icon={ClipboardCheck} label="Approve & Complete" />
        </div>
      )}

      {(status === 'verified' || status === 'completed') && (
        <div className="space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-3 text-sm">
            <p className="font-medium text-green-800">{status === 'completed' ? 'Work Order Completed' : 'Verified by Head Engineer'}</p>
            {workOrder.head_engineer_verified_at && <p className="text-green-600 text-xs mt-0.5">{formatPHT(workOrder.head_engineer_verified_at, true)}</p>}
          </div>
          {workOrder.pdf_url && (
            <a href={workOrder.pdf_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors w-full justify-center">
              <Download className="w-4 h-4" /> Download Signed Receipt
            </a>
          )}
        </div>
      )}

      {status === 'scheduled' && <ActionButton onClick={() => handleStatusChange('in_progress')} loading={loading} icon={RefreshCw} label="Mark In Progress" />}
      {status === 'on_hold' && <ActionButton onClick={() => handleStatusChange('in_progress')} loading={loading} icon={RefreshCw} label="Resume Work" />}

      {workOrder.rejection_reason && status !== 'costing' && status !== 'pending_approval' && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-3 text-sm">
          <p className="font-medium text-red-800">Last rejection reason</p>
          <p className="text-red-700 mt-0.5">{workOrder.rejection_reason}</p>
        </div>
      )}
    </div>
  )
}

function ActionButton({ onClick, loading, icon: Icon, label, variant = 'primary' }: {
  onClick: () => void; loading: boolean; icon: React.ElementType; label: string; variant?: 'primary' | 'secondary'
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors w-full justify-center ${
        variant === 'primary'
          ? 'bg-green-700 hover:bg-green-800 disabled:bg-green-400 text-white'
          : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200'
      }`}
    >
      <Icon className="w-4 h-4" />
      {loading ? 'Please wait…' : label}
    </button>
  )
}
