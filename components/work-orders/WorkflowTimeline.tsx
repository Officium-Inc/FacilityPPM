import type { WorkOrder, ApprovalTrailEntry, WorkOrderStatus } from '@/types'
import { format } from 'date-fns'
import { Check, X, Clock } from 'lucide-react'

const STAGES: { status: WorkOrderStatus; label: string; description: string }[] = [
  { status: 'new_report',       label: 'Service Report',         description: 'Initial fault submitted' },
  { status: 'inspecting',       label: 'Inspection',           description: 'Engineer on-site inspection' },
  { status: 'costing',          label: 'Costing',              description: 'Cost estimate prepared' },
  { status: 'pending_approval', label: 'Cost Approval',        description: 'Awaiting tenant sign-off on cost' },
  { status: 'assigned',         label: 'Assignment',           description: 'Engineer assigned to job' },
  { status: 'in_progress',      label: 'Work Execution',       description: 'Work being carried out' },
  { status: 'svc_submitted',    label: 'Svc. Submitted',       description: 'Completion evidence submitted' },
  { status: 'signed',           label: 'Tenant Sign-Off',      description: 'Tenant approved & signed' },
  { status: 'verified',         label: 'Final Verification',   description: 'Head engineer approved' },
  { status: 'completed',        label: 'Completed',            description: 'WO closed, PDF generated' },
]

const STATUS_ORDER: WorkOrderStatus[] = STAGES.map((s) => s.status)

function getStageIndex(status: WorkOrderStatus): number {
  const idx = STATUS_ORDER.indexOf(status)
  return idx === -1 ? -1 : idx
}

interface Props {
  workOrder: WorkOrder
  approvalTrail: ApprovalTrailEntry[]
}

export default function WorkflowTimeline({ workOrder, approvalTrail }: Props) {
  const currentIndex = getStageIndex(workOrder.status)

  // Legacy / non-workflow statuses — don't show timeline
  if (currentIndex === -1) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="font-semibold text-gray-900 text-sm mb-5">Workflow Progress</h3>

      <ol className="relative">
        {STAGES.map((stage, i) => {
          const isTerminalComplete = workOrder.status === 'completed' && i === STAGES.length - 1
          const done = i < currentIndex || isTerminalComplete
          const active = i === currentIndex && !isTerminalComplete
          const future = i > currentIndex && !isTerminalComplete

          // Find an approval trail entry for this stage
          const trailEntry = approvalTrail.find((t) => {
            if (stage.status === 'pending_approval') return t.stage === 'costing_approval'
            if (stage.status === 'signed') return t.stage === 'sign_off'
            if (stage.status === 'verified') return t.stage === 'final_verification'
            return false
          })

          return (
            <li key={stage.status} className={`flex gap-4 pb-6 last:pb-0 ${future ? 'opacity-40' : ''}`}>
              {/* Connector line */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 ${
                    done
                      ? 'bg-green-600 text-white'
                      : active
                      ? 'bg-green-100 border-2 border-green-600 text-green-700'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {done ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : active ? (
                    <Clock className="w-3.5 h-3.5" />
                  ) : (
                    <span className="text-xs font-medium">{i + 1}</span>
                  )}
                </div>
                {i < STAGES.length - 1 && (
                  <div className={`w-0.5 flex-1 mt-1 ${done ? 'bg-green-300' : 'bg-gray-200'}`} />
                )}
              </div>

              {/* Stage content */}
              <div className="pt-0.5 pb-2 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-sm font-medium ${active ? 'text-green-700' : done ? 'text-gray-900' : 'text-gray-400'}`}>
                    {stage.label}
                  </p>
                  {active && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                      Current
                    </span>
                  )}
                  {trailEntry && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      trailEntry.decision === 'approved'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {trailEntry.decision === 'approved' ? <><Check className="w-2.5 h-2.5 inline mr-0.5" />Approved</> : <><X className="w-2.5 h-2.5 inline mr-0.5" />Rejected</>}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{stage.description}</p>
                {trailEntry && (
                  <div className="mt-1 text-xs text-gray-500">
                    <span className="font-medium">{trailEntry.actor_name}</span>
                    {' · '}
                    {format(new Date(trailEntry.created_at), 'dd MMM yyyy HH:mm')}
                    {trailEntry.reason && (
                      <p className="text-red-500 mt-0.5 italic">&ldquo;{trailEntry.reason}&rdquo;</p>
                    )}
                  </div>
                )}
                {/* Tenant sign-off info */}
                {stage.status === 'signed' && workOrder.signed_by_name && (
                  <div className="mt-1 text-xs text-gray-500">
                    <span className="font-medium">{workOrder.signed_by_name}</span>
                    {workOrder.signed_at && ` · ${format(new Date(workOrder.signed_at), 'dd MMM yyyy HH:mm')}`}
                    {workOrder.rating && (
                      <span className="ml-1 text-yellow-500">
                        {'★'.repeat(workOrder.rating)}{'☆'.repeat(5 - workOrder.rating)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
