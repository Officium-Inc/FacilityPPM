import type { WorkOrder, ApprovalTrailEntry, WorkOrderStatus } from '@/types'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { Check, X } from 'lucide-react'

const STAGES: { status: WorkOrderStatus; label: string; description: string }[] = [
  { status: 'new_report', label: 'Service Report', description: 'Initial fault submitted' },
  { status: 'inspecting', label: 'Inspection', description: 'Engineer on-site inspection' },
  { status: 'costing', label: 'Costing', description: 'Cost estimate prepared' },
  { status: 'pending_approval', label: 'Cost Approval', description: 'Awaiting tenant sign-off on cost' },
  { status: 'assigned', label: 'Assignment', description: 'Engineer assigned to job' },
  { status: 'in_progress', label: 'Work Execution', description: 'Work being carried out' },
  { status: 'signed', label: 'Tenant Sign-Off', description: 'Tenant approved and signed' },
  { status: 'verified', label: 'Final Verification', description: 'Head engineer approved' },
  { status: 'completed', label: 'Completed', description: 'WO closed, PDF generated' },
]

const STATUS_PROGRESS: Partial<Record<WorkOrderStatus, number>> = {
  new_report: 0,
  inspecting: 1,
  costing: 2,
  pending_approval: 3,
  assigned: 4,
  in_progress: 5,
  svc_submitted: 6,
  signed: 7,
  verified: 8,
  completed: 8,
}

function getStageIndex(status: WorkOrderStatus): number {
  const idx = STATUS_PROGRESS[status]
  return idx !== undefined ? idx : -1
}

interface Props {
  workOrder: WorkOrder
  approvalTrail: ApprovalTrailEntry[]
  compact?: boolean
}

export default function WorkflowTimeline({ workOrder, approvalTrail, compact = false }: Props) {
  const currentIndex = getStageIndex(workOrder.status)
  if (currentIndex === -1) return null

  const currentStage = STAGES[currentIndex] ?? STAGES[0]
  const isComplete = workOrder.status === 'completed'
  const progressPercent = isComplete
    ? 100
    : Math.max(0, Math.min(100, (currentIndex / (STAGES.length - 1)) * 100))

  return (
    <div
      className={cn(
        'rounded-lg border border-gray-200 bg-white transition-all duration-200',
        compact ? 'px-3 py-2 shadow-sm' : 'px-4 py-3'
      )}
    >
      <div className={cn('flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between', compact ? 'mb-2' : 'mb-4')}>
        <h3 className={cn('font-semibold text-gray-900', compact ? 'text-xs' : 'text-sm')}>
          Workflow Progress
        </h3>
        <span className="w-fit max-w-full truncate rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
          Current: {currentStage.label}
        </span>
      </div>

      <div className="md:hidden">
        <div className="h-2 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-lime-500 to-sky-500 transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="mt-2 flex items-start justify-between gap-3 text-xs">
          <div className="min-w-0">
            <p className="font-medium text-sky-700">{currentStage.label}</p>
            {!compact && <p className="mt-0.5 text-gray-400">{currentStage.description}</p>}
          </div>
          <span className="shrink-0 text-gray-400">
            Step {currentIndex + 1} of {STAGES.length}
          </span>
        </div>
      </div>

      <div className={cn('hidden overflow-x-auto md:block', compact ? 'pb-0' : 'pb-1')}>
        <ol
          className={cn(
            'relative flex justify-between px-2 pt-1',
            compact ? 'min-w-[42rem] lg:min-w-[48rem] xl:min-w-0' : 'min-w-[48rem] lg:min-w-[54rem] xl:min-w-0'
          )}
        >
          <div
            className={cn(
              'absolute rounded-full bg-gray-200',
              compact ? 'left-7 right-7 top-3 h-1' : 'left-8 right-8 top-4 h-1.5'
            )}
          />
          <div
            className={cn(
              'absolute rounded-full bg-gradient-to-r from-lime-500 to-sky-500 transition-all',
              compact ? 'left-7 top-3 h-1' : 'left-8 top-4 h-1.5'
            )}
            style={{ width: `calc((100% - ${compact ? '3.5rem' : '4rem'}) * ${progressPercent / 100})` }}
          />

          {STAGES.map((stage, i) => {
            const done = i < currentIndex || isComplete
            const active = i === currentIndex && !isComplete
            const trailEntry = approvalTrail.find((t) => {
              if (stage.status === 'pending_approval') return t.stage === 'costing_approval'
              if (stage.status === 'signed') return t.stage === 'sign_off'
              if (stage.status === 'verified') return t.stage === 'final_verification'
              return false
            })
            const rejected = trailEntry?.decision === 'rejected'

            return (
              <li
                key={stage.status}
                className={cn(
                  'relative z-10 flex flex-col items-center text-center',
                  compact ? 'w-16 lg:w-20' : 'w-20 lg:w-24'
                )}
              >
                <div
                  className={cn(
                    'flex items-center justify-center rounded-full font-semibold shadow-sm transition-all',
                    compact ? 'h-6 w-6 text-xs' : 'h-8 w-8 text-sm',
                    rejected
                      ? 'bg-red-500 text-white'
                      : done
                      ? 'bg-lime-500 text-white'
                      : active
                      ? 'bg-sky-600 text-white'
                      : 'bg-gray-100 text-gray-400'
                  )}
                >
                  {rejected ? (
                    <X className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
                  ) : done ? (
                    <Check className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
                  ) : (
                    i + 1
                  )}
                </div>
                <div className={cn(compact ? 'mt-1 min-h-8' : 'mt-2 min-h-12')}>
                  <p
                    className={cn(
                      'font-medium leading-tight',
                      compact ? 'text-[11px]' : 'text-xs',
                      rejected
                        ? 'text-red-600'
                        : done
                        ? 'text-lime-700'
                        : active
                        ? 'text-sky-700'
                        : 'text-gray-400'
                    )}
                  >
                    {stage.label}
                  </p>
                  {active && !compact && (
                    <p className="mt-0.5 text-[11px] text-gray-400">{stage.description}</p>
                  )}
                  {trailEntry && !compact && (
                    <p className={cn('mt-0.5 text-[11px]', rejected ? 'text-red-500' : 'text-gray-400')}>
                      {trailEntry.decision === 'approved' ? 'Approved' : 'Rejected'}
                    </p>
                  )}
                </div>

                {(trailEntry || (stage.status === 'signed' && workOrder.signed_by_name)) && (
                  <div className="sr-only">
                    {trailEntry && (
                      <>
                        {trailEntry.actor_name}
                        {' '}
                        {format(new Date(trailEntry.created_at), 'dd MMM yyyy HH:mm')}
                        {trailEntry.reason ? ` ${trailEntry.reason}` : ''}
                      </>
                    )}
                    {stage.status === 'signed' && workOrder.signed_by_name && ` Signed by ${workOrder.signed_by_name}`}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
