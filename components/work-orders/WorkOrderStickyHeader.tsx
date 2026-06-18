'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Ban } from 'lucide-react'
import type { ApprovalTrailEntry, WorkOrder } from '@/types'
import { cn } from '@/lib/utils'
import StatusBadge from './StatusBadge'
import WorkflowTimeline from './WorkflowTimeline'

interface WorkOrderStickyHeaderProps {
  slug: string
  workOrder: WorkOrder
  approvalTrail: ApprovalTrailEntry[]
}

type ScrollTarget = HTMLElement | Window

function getScrollableParent(element: HTMLElement): ScrollTarget {
  let parent = element.parentElement

  while (parent) {
    const overflowY = window.getComputedStyle(parent).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      return parent
    }
    parent = parent.parentElement
  }

  return window
}

function getScrollTop(target: ScrollTarget) {
  return 'scrollY' in target ? target.scrollY : target.scrollTop
}

function syncStickyOffset(header: HTMLElement) {
  document.documentElement.style.setProperty(
    '--wo-sticky-header-height',
    `${header.offsetHeight + 12}px`
  )
}

export default function WorkOrderStickyHeader({
  slug,
  workOrder,
  approvalTrail,
}: WorkOrderStickyHeaderProps) {
  const headerRef = useRef<HTMLDivElement | null>(null)
  const compactRef = useRef(false)
  const lastScrollTopRef = useRef(0)
  const lastToggleAtRef = useRef(0)
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    const header = headerRef.current
    if (!header) return

    const scrollTarget = getScrollableParent(header)
    let frame = 0

    const update = () => {
      if (frame) window.cancelAnimationFrame(frame)

      frame = window.requestAnimationFrame(() => {
        const scrollTop = getScrollTop(scrollTarget)
        const scrollingUp = scrollTop < lastScrollTopRef.current
        const now = window.performance.now()
        let nextCompact = compactRef.current

        if (!compactRef.current && scrollTop > 120) {
          nextCompact = true
        } else if (
          compactRef.current &&
          scrollTop <= 2 &&
          scrollingUp &&
          now - lastToggleAtRef.current > 200
        ) {
          nextCompact = false
        }

        if (nextCompact !== compactRef.current) {
          compactRef.current = nextCompact
          lastToggleAtRef.current = now
          setCompact(nextCompact)
        }

        lastScrollTopRef.current = scrollTop
        syncStickyOffset(header)
        frame = 0
      })
    }

    const resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(header)

    update()
    scrollTarget.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      scrollTarget.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      document.documentElement.style.removeProperty('--wo-sticky-header-height')
    }
  }, [])

  useEffect(() => {
    if (headerRef.current) syncStickyOffset(headerRef.current)
  }, [compact])

  return (
    <div
      ref={headerRef}
      className={cn(
        'sticky top-0 z-40 border-b border-gray-200 bg-gray-50 backdrop-blur transition-shadow duration-200',
        compact && 'shadow-sm'
      )}
    >
      <div
        className={cn(
          'mx-auto w-full max-w-[96rem] px-4 transition-[padding] duration-150 ease-out sm:px-6',
          compact ? 'py-2' : 'py-3'
        )}
      >
        <div className={cn(compact ? 'mb-2' : 'mb-3 space-y-2')}>
          {!compact && (
            <Link
              href={`/${slug}/work-orders`}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Work Orders
            </Link>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  className={cn(
                    'font-bold text-gray-900 transition-all duration-200',
                    compact ? 'text-base' : 'text-xl'
                  )}
                >
                  {workOrder.wo_number}
                </h2>
                <StatusBadge status={workOrder.status} />
                {workOrder.is_cost_waived && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                    <Ban className="h-3 w-3" /> Cost Waived
                  </span>
                )}
              </div>
              {!compact && (
                <p className="mt-0.5 text-xs capitalize text-gray-500">
                  {workOrder.type} - {workOrder.priority} priority
                </p>
              )}
            </div>

            {compact && (
              <Link
                href={`/${slug}/work-orders`}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm hover:text-gray-800"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </Link>
            )}
          </div>
        </div>

        <WorkflowTimeline workOrder={workOrder} approvalTrail={approvalTrail} compact={compact} />
      </div>
    </div>
  )
}
