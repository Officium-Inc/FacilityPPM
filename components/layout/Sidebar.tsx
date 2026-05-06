'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ClipboardList,
  Package,
  Users,
  CalendarClock,
  BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'

function buildNav(slug: string) {
  return [
    { href: `/${slug}`, label: 'Dashboard', icon: LayoutDashboard },
    { href: `/${slug}/work-orders`, label: 'Work Orders', icon: ClipboardList },
    { href: `/${slug}/assets`, label: 'Assets', icon: Package },
    { href: `/${slug}/engineers`, label: 'Engineers', icon: Users },
    { href: `/${slug}/schedules`, label: 'Schedules', icon: CalendarClock },
    { href: `/${slug}/reports`, label: 'Reports', icon: BarChart3 },
  ]
}

export default function Sidebar({ slug }: { slug: string }) {
  const pathname = usePathname()
  const nav = buildNav(slug)
  const base = `/${slug}`

  return (
    <aside className="hidden md:flex flex-col w-60 bg-gray-900 min-h-screen shrink-0">
      {/* Brand */}
      <div className="px-6 py-5 border-b border-gray-700/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm">M</span>
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">FacilityPPM</p>
            <p className="text-gray-400 text-xs">Marajo PM</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === base ? pathname === base : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="px-3 py-4 border-t border-gray-700/50">
        <p className="text-xs text-gray-500 px-3">v2.0</p>
      </div>
    </aside>
  )
}
