import { Check } from 'lucide-react'
import type { TenantProgress, TenantProgressStep } from '@/lib/tenant-progress'
import { cn } from '@/lib/utils'

/** Where a service report stands: vertical steps on phones, horizontal from `sm`. */
export default function TenantProgressTracker({ progress }: { progress: TenantProgress }) {
  const { steps, next } = progress

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5" aria-labelledby="tenant-progress-title">
      <h3 id="tenant-progress-title" className="text-sm font-semibold text-gray-900">Progress</h3>
      {next && <p className="mt-1 text-sm text-gray-600">{next}</p>}

      <ol className="mt-5 grid sm:grid-cols-6">
        {steps.map((step, index) => {
          const following = steps[index + 1]
          const reached = following && following.state !== 'upcoming'
          return (
            <li
              key={step.key}
              className="relative flex gap-3 pb-5 last:pb-0 sm:flex-col sm:items-center sm:gap-2 sm:pb-0 sm:text-center"
              aria-current={step.state === 'current' ? 'step' : undefined}
            >
              {following && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute left-[11px] top-7 h-[calc(100%-2rem)] w-0.5 sm:left-[calc(50%+14px)] sm:top-[11px] sm:h-0.5 sm:w-[calc(100%-28px)]',
                    reached ? 'bg-green-600' : 'bg-gray-200'
                  )}
                />
              )}
              <StepDot step={step} number={index + 1} />
              <div className="min-w-0 sm:px-1">
                <p
                  className={cn(
                    'text-sm font-medium sm:text-xs',
                    step.state === 'current'
                      ? step.yours ? 'text-amber-800' : 'text-gray-900'
                      : step.state === 'done' ? 'text-gray-700' : 'text-gray-400'
                  )}
                >
                  {step.label}
                </p>
                {step.atLabel && <p className="text-xs text-gray-400">{step.atLabel}</p>}
                {step.state === 'current' && (
                  <p className={cn('text-xs font-medium', step.yours ? 'text-amber-700' : 'text-green-700')}>
                    {step.yours ? 'Waiting for you' : 'In progress'}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function StepDot({ step, number }: { step: TenantProgressStep; number: number }) {
  if (step.state === 'done') {
    return (
      <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
        <span className="sr-only">Done:</span>
      </span>
    )
  }
  if (step.state === 'current') {
    return (
      <span
        className={cn(
          'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 bg-white',
          step.yours ? 'border-amber-500' : 'border-green-600'
        )}
      >
        <span className={cn('h-2.5 w-2.5 rounded-full', step.yours ? 'bg-amber-500' : 'bg-green-600')} />
        <span className="sr-only">Current step:</span>
      </span>
    )
  }
  return (
    <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-gray-200 bg-white text-[11px] font-semibold text-gray-400">
      {number}
    </span>
  )
}
