'use client'

import { useState } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  addMonths,
  subMonths,
  getDay,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PpmCalendarProps {
  dueDates: string[] // ISO date strings
}

export default function PpmCalendar({ dueDates }: PpmCalendarProps) {
  const [current, setCurrent] = useState(new Date())

  const start = startOfMonth(current)
  const end = endOfMonth(current)
  const days = eachDayOfInterval({ start, end })
  const startWeekday = getDay(start) // 0 = Sunday

  const dueParsed = dueDates.map((d) => new Date(d))

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900 text-sm">PPM Calendar</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrent(subMonths(current, 1))}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[100px] text-center">
            {format(current, 'MMMM yyyy')}
          </span>
          <button
            onClick={() => setCurrent(addMonths(current, 1))}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-1">
        {/* Empty cells before month start */}
        {Array.from({ length: startWeekday }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {days.map((day) => {
          const hasDue = dueParsed.some((d) => isSameDay(d, day))
          const isToday = isSameDay(day, new Date())
          return (
            <div
              key={day.toISOString()}
              className={cn(
                'text-center text-xs py-1.5 rounded-full mx-auto w-7 h-7 flex items-center justify-center transition-colors',
                isToday && !hasDue && 'bg-green-100 text-green-700 font-semibold',
                hasDue && 'bg-green-600 text-white font-semibold',
                !isToday && !hasDue && 'text-gray-600'
              )}
            >
              {format(day, 'd')}
            </div>
          )
        })}
      </div>

      {hasDueDates(dueParsed, current) && (
        <p className="text-xs text-gray-400 mt-3 flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-600" />
          Days with scheduled PPM
        </p>
      )}
    </div>
  )
}

function hasDueDates(dates: Date[], month: Date): boolean {
  return dates.some(
    (d) => d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth()
  )
}
