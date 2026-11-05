'use client'

import { useId, useRef, type ReactNode } from 'react'
import { FileDown, FileWarning, X } from 'lucide-react'

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2'

/**
 * "Service Report Form" button that opens the on-screen form in a modal dialog. The native <dialog>
 * handles Esc, keeps focus inside while open and returns it to the button on close.
 */
export default function ServiceReportFormDialog({ woNumber, pdfHref, children }: {
  woNumber: string
  pdfHref: string
  /** The form itself (rendered on the server). */
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const close = () => dialogRef.current?.close()

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-sm transition-colors hover:bg-gray-50 ${FOCUS}`}
      >
        <FileWarning className="h-4 w-4" aria-hidden="true" />
        Service Report Form
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        // A click on the backdrop lands on the dialog element itself
        onClick={(event) => { if (event.target === event.currentTarget) close() }}
        className="m-auto max-h-[90dvh] w-[min(64rem,calc(100%-2rem))] overflow-hidden rounded-xl bg-white p-0 shadow-xl backdrop:bg-gray-900/50"
      >
        <div className="flex max-h-[90dvh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-3">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold text-gray-900">Service Report Form</h2>
              <p className="text-xs text-gray-500">{woNumber}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={pdfHref}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 ${FOCUS}`}
              >
                <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                Download PDF
              </a>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className={`rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 ${FOCUS}`}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="overflow-y-auto">{children}</div>
        </div>
      </dialog>
    </>
  )
}
