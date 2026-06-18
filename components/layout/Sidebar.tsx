'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ClipboardList,
  Package,
  CalendarClock,
  BarChart3,
  AlertTriangle,
  Ban,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { normalizeRoleName } from '@/lib/roles'

type NavItem = { href: string; label: string; icon: React.ElementType }

const WORK_ORDER_ROLES = ['admin', 'head_engineer']
const WAIVED_ORDER_ROLES = ['admin', 'property_manager']
const MEMBERS_MANAGE_ROLES = ['admin', 'property_manager']

function buildNav(slug: string, userRole: string): NavItem[] {
  const base = `/${slug}`
  const normalizedRole = normalizeRoleName(userRole)
  const nav: NavItem[] = [
    { href: base, label: 'Dashboard', icon: LayoutDashboard },
  ]

  if (WORK_ORDER_ROLES.includes(normalizedRole)) {
    nav.push({ href: `${base}/work-orders`, label: 'Work Orders', icon: ClipboardList })
    nav.push({ href: `${base}/assets`, label: 'Assets', icon: Package })
  }

  if (WAIVED_ORDER_ROLES.includes(normalizedRole)) {
    nav.push({ href: `${base}/waived-orders`, label: 'Waived Orders', icon: Ban })
  }

  nav.push({ href: `${base}/fault-reports`, label: 'Service Request', icon: AlertTriangle })
  nav.push({ href: `${base}/schedules`, label: 'Schedules', icon: CalendarClock })
  nav.push({ href: `${base}/reports`, label: 'Reports', icon: BarChart3 })
  nav.push({ href: `${base}/settings`, label: 'Settings', icon: Settings })

  return nav
}

export default function Sidebar({ slug, userRole }: { slug: string; userRole: string }) {
  const pathname = usePathname()
  const base = `/${slug}`
  const nav = buildNav(slug, userRole)

  return (
    <aside className="hidden md:flex flex-col w-60 bg-gray-900 min-h-screen shrink-0">
      {/* Brand */}
      <div className="px-6 py-5 border-b border-gray-700/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center shrink-0">
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
                  ? 'bg-green-600 text-white'
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

