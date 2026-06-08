'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { WorkOrder, Engineer } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { Send, ExternalLink, Download, RefreshCw, ClipboardCheck, UserCheck } from 'lucide-react'
import { format } from 'date-fns'

interface WorkOrderActionsProps {
  workOrder: WorkOrder
  engineers?: Engineer[]
  slug: string
}

const INPUT = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500'

export default function WorkOrderActions({ workOrder, engineers = [], slug: _slug }: WorkOrderActionsProps) {
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
  const [tenantEmail, setTenantEmail] = useState('')
  const [tenantName, setTenantName] = useState('')

  const [assignEngineerId, setAssignEngineerId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [assignInstructions, setAssignInstructions] = useState('')

  const [workDescription, setWorkDescription] = useState('')
  const [hoursLogged, setHoursLogged] = useState(0)
  const [evidenceTenantEmail, setEvidenceTenantEmail] = useState('')
  const [evidenceTenantName, setEvidenceTenantName] = useState('')

  const [verifyNotes, setVerifyNotes] = useState('')

  const { status } = workOrder

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
        <ActionButton onClick={() => handleStatusChange('inspecting')} loading={loading} icon={RefreshCw} label="Start Inspection" />
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
          <input type="email" value={tenantEmail} onChange={(e) => setTenantEmail(e.target.value)} placeholder="Tenant email" className={INPUT} />
          <input type="text" value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder="Tenant name (optional)" className={INPUT} />
          <ActionButton
            onClick={() => apiPost(`/api/work-orders/${workOrder.id}/costing`, { labourHours, labourRate, materialsTotal, subcontractorTotal, notes: costingNotes, tenantEmail, tenantName })}
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
        <div className="space-y-3">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Assign Engineer</p>
          {workOrder.costing_approved_by_name && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700">
              Cost approved by {workOrder.costing_approved_by_name}
              {workOrder.costing_approved_at && ` on ${format(new Date(workOrder.costing_approved_at), 'dd MMM yyyy')}`}
            </div>
          )}
          <select value={assignEngineerId} onChange={(e) => setAssignEngineerId(e.target.value)} className={INPUT}>
            <option value="">Select engineer…</option>
            {engineers.map((eng) => (
              <option key={eng.id} value={eng.id}>{eng.full_name}</option>
            ))}
          </select>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={INPUT} />
          <textarea value={assignInstructions} onChange={(e) => setAssignInstructions(e.target.value)} placeholder="Assignment instructions…" rows={2} className={INPUT} />
          <ActionButton
            onClick={() => apiPost(`/api/work-orders/${workOrder.id}/assign`, { engineerId: assignEngineerId, dueDate, instructions: assignInstructions })}
            loading={loading} icon={UserCheck} label="Confirm Assignment"
          />
          <ActionButton onClick={() => handleStatusChange('in_progress')} loading={loading} icon={RefreshCw} label="Skip ? Mark In Progress" variant="secondary" />
        </div>
      )}

      {status === 'in_progress' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Submit Completion Evidence</p>
          <textarea value={workDescription} onChange={(e) => setWorkDescription(e.target.value)} placeholder="Describe what was done…" rows={3} className={INPUT} />
          <input type="number" value={hoursLogged} onChange={(e) => setHoursLogged(Number(e.target.value))} placeholder="Hours logged" min={0} step={0.5} className={INPUT} />
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide pt-1">Send sign-off to tenant</p>
          <input type="email" value={evidenceTenantEmail} onChange={(e) => setEvidenceTenantEmail(e.target.value)} placeholder="Tenant email" className={INPUT} />
          <input type="text" value={evidenceTenantName} onChange={(e) => setEvidenceTenantName(e.target.value)} placeholder="Tenant name (optional)" className={INPUT} />
          <ActionButton
            onClick={() => apiPost(`/api/work-orders/${workOrder.id}/complete-evidence`, { workDescription, hoursLogged, tenantEmail: evidenceTenantEmail, tenantName: evidenceTenantName })}
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
            {workOrder.signed_at && <p className="text-teal-600 text-xs mt-0.5">{format(new Date(workOrder.signed_at), 'dd MMM yyyy HH:mm')}</p>}
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
            {workOrder.head_engineer_verified_at && <p className="text-green-600 text-xs mt-0.5">{format(new Date(workOrder.head_engineer_verified_at), 'dd MMM yyyy HH:mm')}</p>}
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
