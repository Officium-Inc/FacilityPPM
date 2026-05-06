import { CheckCircle, XCircle, MinusCircle } from 'lucide-react'
import type { ChecklistResult } from '@/types'

interface ChecklistItemProps {
  description: string
  result: ChecklistResult
  remarks?: string | null
  photoUrls?: string[]
  sortOrder?: number
}

const resultConfig = {
  pass: { icon: CheckCircle, color: 'text-green-500', label: 'Pass' },
  fail: { icon: XCircle, color: 'text-red-500', label: 'Fail' },
  na: { icon: MinusCircle, color: 'text-gray-400', label: 'N/A' },
}

export default function ChecklistItem({
  description,
  result,
  remarks,
  photoUrls = [],
}: ChecklistItemProps) {
  const cfg = result ? resultConfig[result] : null

  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className="mt-0.5">
        {cfg ? (
          <cfg.icon className={`w-5 h-5 ${cfg.color}`} />
        ) : (
          <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
        )}
      </div>
      <div className="flex-1">
        <p className="text-sm text-gray-800 font-medium">{description}</p>
        {remarks && <p className="text-xs text-gray-500 mt-0.5">{remarks}</p>}
        {photoUrls.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {photoUrls.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={url}
                alt={`Photo ${i + 1}`}
                className="w-16 h-16 object-cover rounded-lg border border-gray-200"
              />
            ))}
          </div>
        )}
      </div>
      {cfg && (
        <span className={`text-xs font-medium mt-0.5 ${cfg.color}`}>{cfg.label}</span>
      )}
    </div>
  )
}
