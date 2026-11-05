import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorkflowStep } from '@/lib/work-order-workflow'

const LINK_FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2'

/** The details of one workflow step: label/value grid, cost items, photos, documents and who did it. */
export default function StepDetails({ step, showActor = true }: { step: WorkflowStep; showActor?: boolean }) {
  const images = step.files.filter((file) => file.kind === 'image')
  const documents = step.files.filter((file) => file.kind === 'document')

  return (
    <div className="space-y-4">
      {step.fields.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {step.fields.map((field) => (
            <div key={field.label} className={cn('min-w-0', field.wide && 'sm:col-span-2')}>
              <dt className="text-xs text-gray-500">{field.label}</dt>
              <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm text-gray-900">{field.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {step.lineItems.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-xs">
            <caption className="sr-only">Cost estimate items</caption>
            <thead className="text-gray-500">
              <tr className="border-b border-gray-200">
                <th scope="col" className="py-1.5 pr-3 font-medium">Item</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">Qty</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">Provided by</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">Unit cost</th>
                <th scope="col" className="py-1.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-900">
              {step.lineItems.map((item, index) => (
                <tr key={index}>
                  <td className="py-1.5 pr-3">{item.description}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3">{item.qtyUnit}</td>
                  <td className="py-1.5 pr-3">{item.providedBy}{item.excluded ? ' (not charged)' : ''}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-right">{item.unitCost}</td>
                  <td className={cn('whitespace-nowrap py-1.5 text-right', item.excluded && 'text-gray-500 line-through')}>{item.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {images.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Photos">
          {images.map((image) => (
            <li key={image.url}>
              <a href={image.url} target="_blank" rel="noopener noreferrer" className={cn('block rounded-lg', LINK_FOCUS)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={image.label}
                  loading="lazy"
                  className="h-20 w-20 rounded-lg border border-gray-200 object-cover transition-opacity hover:opacity-90"
                />
              </a>
            </li>
          ))}
        </ul>
      )}

      {documents.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Documents">
          {documents.map((doc) => (
            <li key={doc.url}>
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-green-600 hover:text-green-800',
                  LINK_FOCUS
                )}
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                {doc.label}
              </a>
            </li>
          ))}
        </ul>
      )}

      {showActor && step.actorLine && <p className="text-xs text-gray-500">{step.actorLine}</p>}
    </div>
  )
}
