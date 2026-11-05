'use client'

import { useId, useState, type ReactNode } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StepNotice, WorkflowStep, WorkflowStepKey, WorkflowView } from '@/lib/work-order-workflow'
import StepDetails from './StepDetails'

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2'

interface WorkflowStepsProps {
  view: WorkflowView
  /** The action form for the current step (approve, send back, assign, ...). */
  actions?: ReactNode
}

/**
 * Vertical workflow timeline: completed steps collapse to one line, the current step is an open card with
 * its action form, upcoming steps are muted.
 */
export default function WorkflowSteps({ view, actions }: WorkflowStepsProps) {
  const baseId = useId()
  const expandable = view.steps.filter((step) => step.state === 'done' && step.hasDetails).map((step) => step.key)
  const [open, setOpen] = useState<Set<WorkflowStepKey>>(() => new Set())
  const allOpen = expandable.length > 0 && expandable.every((key) => open.has(key))

  function toggle(key: WorkflowStepKey) {
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <section aria-labelledby={`${baseId}-title`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id={`${baseId}-title`} className="text-base font-semibold text-gray-900">Workflow</h2>
        {expandable.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(allOpen ? new Set() : new Set(expandable))}
            className={cn('rounded text-sm font-medium text-green-700 transition-colors hover:text-green-800 hover:underline', FOCUS)}
          >
            {allOpen ? 'Collapse completed' : 'Expand completed'}
          </button>
        )}
      </div>

      <ol aria-label="Workflow steps">
        {view.steps.map((step, index) => {
          const next = view.steps[index + 1]
          // The line to the next marker is green while the work has reached it
          const lineDone = step.state === 'done' && next !== undefined && next.state !== 'upcoming'
          return (
            <li key={step.key} aria-current={step.state === 'current' ? 'step' : undefined} className="relative flex gap-4 pb-6 last:pb-0">
              {next && (
                <span
                  aria-hidden="true"
                  className={cn('absolute left-4 top-4 -bottom-4 w-0.5 -translate-x-1/2', lineDone ? 'bg-green-600' : 'bg-gray-200')}
                />
              )}
              <Marker step={step} />
              <div className="min-w-0 flex-1">
                {step.state === 'done' && (
                  <DoneStep step={step} id={`${baseId}-${step.key}`} open={open.has(step.key)} onToggle={() => toggle(step.key)} />
                )}
                {(step.state === 'current' || step.state === 'cancelled') && (
                  <CurrentStep step={step} id={`${baseId}-${step.key}`} previous={view.previousStep} notice={view.notice} actions={actions} />
                )}
                {step.state === 'upcoming' && (
                  <div className="pt-1">
                    <p className="text-sm font-medium text-gray-500">{step.label}</p>
                    <p className="text-xs text-gray-500">{step.description}</p>
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function Marker({ step }: { step: WorkflowStep }) {
  const label = { done: 'Completed', current: 'Current step', upcoming: 'Upcoming', cancelled: 'Cancelled' }[step.state]
  return (
    <span className="relative z-10 flex w-8 shrink-0 justify-center">
      {step.state === 'done' && (
        <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-green-600 text-white">
          <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
        </span>
      )}
      {step.state === 'current' && (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-600 text-sm font-semibold text-white ring-4 ring-sky-100">
          {step.number}
        </span>
      )}
      {step.state === 'cancelled' && (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white ring-4 ring-red-100">
          <X className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
        </span>
      )}
      {step.state === 'upcoming' && (
        <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-gray-300 bg-white text-[11px] font-medium text-gray-500">
          {step.number}
        </span>
      )}
      <span className="sr-only">{label}: </span>
    </span>
  )
}

function DoneStep({ step, id, open, onToggle }: { step: WorkflowStep; id: string; open: boolean; onToggle: () => void }) {
  const row = (
    <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <span className="min-w-0 sm:flex sm:items-baseline sm:gap-2">
        <span className="shrink-0 text-sm font-medium text-gray-900">{step.label}</span>
        {step.summary && <span className="block min-w-0 truncate text-sm text-gray-500">{step.summary}</span>}
      </span>
      {step.at && step.atLabel && (
        <time dateTime={step.at} className="mt-0.5 shrink-0 whitespace-nowrap text-xs text-gray-500 sm:mt-0">
          {step.atLabel}
        </time>
      )}
    </span>
  )

  if (!step.hasDetails) return <div className="flex items-start gap-2 pt-1 pr-6">{row}</div>

  return (
    <>
      <h3>
        <button
          type="button"
          id={`${id}-button`}
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={onToggle}
          className={cn('group -mx-2 flex w-[calc(100%+1rem)] items-start gap-2 rounded-lg px-2 pt-1 text-left transition-colors hover:bg-gray-100/70', FOCUS)}
        >
          {row}
          <ChevronDown
            className={cn('mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:text-gray-600', open && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
      </h3>
      <div id={`${id}-panel`} hidden={!open} className="mt-3 border-l-2 border-gray-200 pl-4">
        <StepDetails step={step} />
      </div>
    </>
  )
}

function CurrentStep({ step, id, previous, notice, actions }: {
  step: WorkflowStep
  id: string
  previous: WorkflowStep | null
  notice: StepNotice | null
  actions?: ReactNode
}) {
  const cancelled = step.state === 'cancelled'
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn('rounded-xl border bg-white p-4 shadow-sm sm:p-5', cancelled ? 'border-red-200' : 'border-sky-200')}
    >
      <p className={cn('text-xs font-semibold', cancelled ? 'text-red-700' : 'text-sky-700')}>
        {cancelled ? 'Cancelled at this step' : 'Current step'}
      </p>
      <h3 id={`${id}-title`} className="mt-1 text-lg font-semibold text-gray-900">{step.label}</h3>
      <p className="mt-0.5 text-sm text-gray-500">{step.description}</p>
      {step.tag && (
        <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
          {step.tag}
        </span>
      )}

      {notice && <Notice notice={notice} />}

      {previous && (
        <div className="mt-4 rounded-lg bg-gray-50 p-4">
          <p className="text-sm text-gray-900">
            <span className="font-semibold">{previous.label}:</span>
            {previous.summary ? ` ${previous.summary}` : ''}
          </p>
          {previous.actorLine && <p className="mt-0.5 text-xs text-gray-500">{previous.actorLine}</p>}
          {previous.hasDetails && (
            <>
              <hr className="my-3 border-gray-200" />
              <StepDetails step={previous} showActor={false} />
            </>
          )}
        </div>
      )}

      {actions && <div className="mt-5">{actions}</div>}
    </section>
  )
}

function Notice({ notice }: { notice: StepNotice }) {
  const danger = notice.tone === 'danger'
  return (
    <div
      className={cn(
        'mt-4 rounded-lg border px-3 py-2.5 text-sm',
        danger ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'
      )}
    >
      <p className="font-medium">{notice.title}</p>
      {notice.reason && <p className="mt-0.5 whitespace-pre-wrap break-words">{notice.reason}</p>}
      {notice.actorLine && <p className={cn('mt-1 text-xs', danger ? 'text-red-700' : 'text-amber-800')}>{notice.actorLine}</p>}
    </div>
  )
}
