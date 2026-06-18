import { cn } from '@/lib/utils'

type LoadingTone = 'green' | 'blue'

interface LoadingStateProps {
  title?: string
  message?: string
  tone?: LoadingTone
  fullScreen?: boolean
  className?: string
}

const toneClasses: Record<LoadingTone, {
  badge: string
  ring: string
  dot: string
  glow: string
}> = {
  green: {
    badge: 'bg-green-600',
    ring: 'border-t-green-600',
    dot: 'bg-green-600',
    glow: 'bg-green-500',
  },
  blue: {
    badge: 'bg-blue-600',
    ring: 'border-t-blue-600',
    dot: 'bg-blue-600',
    glow: 'bg-blue-500',
  },
}

export default function LoadingState({
  title = 'Loading Tenant360',
  message = 'Preparing your workspace...',
  tone = 'green',
  fullScreen = false,
  className,
}: LoadingStateProps) {
  const colors = toneClasses[tone]

  return (
    <div
      className={cn(
        'flex min-h-[18rem] items-center justify-center bg-gray-50 p-6',
        fullScreen && 'min-h-dvh',
        className
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <div className="relative h-16 w-16">
          <div className={cn('absolute inset-1 rounded-2xl opacity-20 blur-lg', colors.glow)} />
          <div className={cn('absolute inset-0 rounded-2xl border-2 border-gray-200 bg-white shadow-sm', colors.ring, 'animate-spin')} />
          <div className={cn('absolute inset-3 flex items-center justify-center rounded-xl shadow-sm', colors.badge)}>
            <span className="text-lg font-bold text-white">T</span>
          </div>
        </div>

        <div className="mt-5">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="mt-1 text-sm text-gray-500">{message}</p>
        </div>

        <div className="mt-4 flex items-center gap-1.5" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className={cn('loading-dot h-2 w-2 rounded-full', colors.dot)}
              style={{ animationDelay: `${index * 140}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
