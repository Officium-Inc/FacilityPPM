'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Menu,
  X,
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
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const base = `/${slug}`
  const nav = buildNav(slug, userRole)

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  return (
    <>
    <aside
      className={cn(
        'hidden md:flex flex-col bg-gray-900 min-h-screen shrink-0 transition-[width] duration-300 ease-out',
        collapsed ? 'w-20' : 'w-60'
      )}
    >
      {/* Brand */}
      <div className={cn('border-b border-gray-700/50 py-5', collapsed ? 'px-3' : 'px-6')}>
        <div className={cn('flex', collapsed ? 'flex-col items-center gap-3' : 'items-center gap-3')}>
          <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm">M</span>
          </div>
          <div className={cn('min-w-0 transition-all duration-200', collapsed ? 'hidden' : 'block')}>
            <p className="text-white font-semibold text-sm leading-tight">FacilityPPM</p>
            <p className="text-gray-400 text-xs">Marajo PM</p>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className={cn(
              'rounded-lg p-1.5 text-gray-400 transition-all duration-200 hover:bg-gray-800 hover:text-white active:scale-95',
              !collapsed && 'ml-auto'
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Menu className="h-4 w-4" />
          </button>
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
              title={collapsed ? label : undefined}
              className={cn(
                'group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ease-out',
                collapsed && 'justify-center px-0',
                active
                  ? 'bg-green-600 text-white shadow-sm shadow-green-950/20'
                  : 'text-gray-400 hover:translate-x-0.5 hover:text-white hover:bg-gray-800'
              )}
            >
              <Icon className="w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
              <span className={cn('truncate transition-opacity duration-200', collapsed ? 'hidden' : 'inline')}>
                {label}
              </span>
            </Link>
          )
        })}
      </nav>

      <div className="px-3 py-4 border-t border-gray-700/50">
        <p className={cn('text-xs text-gray-500 px-3', collapsed && 'px-0 text-center')}>v0.1alpha</p>
      </div>
    </aside>

    <button
      type="button"
      onClick={() => setMobileOpen(true)}
      className="fixed left-3 top-3 z-50 inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-all duration-200 hover:bg-gray-100 hover:text-gray-700 active:scale-95 md:hidden"
      aria-label="Open navigation"
    >
      <Menu className="h-5 w-5" />
    </button>

      <div
        className={cn(
          'fixed inset-0 z-[80] transition md:hidden',
          mobileOpen ? 'pointer-events-auto' : 'pointer-events-none'
        )}
        aria-hidden={!mobileOpen}
      >
        <button
          type="button"
          className={cn(
            'absolute inset-0 bg-black/40 transition-opacity duration-200 ease-out',
            mobileOpen ? 'opacity-100' : 'opacity-0'
          )}
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        />
        <aside
          className={cn(
            'relative flex h-full w-72 max-w-[85vw] flex-col bg-gray-900 shadow-2xl transition-transform duration-300 ease-out',
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className="flex items-center justify-between border-b border-gray-700/50 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-600">
                <span className="text-sm font-bold text-white">M</span>
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight text-white">FacilityPPM</p>
                <p className="text-xs text-gray-400">Marajo PM</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="rounded-lg p-1.5 text-gray-400 transition-all duration-200 hover:bg-gray-800 hover:text-white active:scale-95"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
            {nav.map(({ href, label, icon: Icon }) => {
              const active = href === base ? pathname === base : pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ease-out',
                    active
                      ? 'bg-green-600 text-white shadow-sm shadow-green-950/20'
                      : 'text-gray-400 hover:translate-x-0.5 hover:bg-gray-800 hover:text-white'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
                  {label}
                </Link>
              )
            })}
          </nav>

          <div className="border-t border-gray-700/50 px-3 py-4">
            <p className="px-3 text-xs text-gray-500">v0.1alpha</p>
          </div>
        </aside>
      </div>
    </>
  )
}

