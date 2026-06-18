'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Building2, LogOut, LayoutDashboard, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

const nav = [
  { href: '/provider/properties', label: 'Properties', icon: Building2 },
]

export default function ProviderSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/provider/login')
    router.refresh()
  }

  return (
    <>
    <aside
      className={cn(
        'group/sidebar relative hidden md:flex flex-col bg-gray-900 min-h-screen shrink-0 transition-[width] duration-300 ease-out',
        collapsed ? 'w-20' : 'w-60'
      )}
    >
      {/* Brand */}
      <div className={cn('border-b border-gray-700/50 py-5', collapsed ? 'px-3' : 'px-6')}>
        <div className={cn('flex items-center', collapsed ? 'justify-center' : 'gap-3')}>
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm">M</span>
          </div>
          <div className={cn('min-w-0 transition-all duration-200', collapsed ? 'hidden' : 'block')}>
            <p className="text-white font-semibold text-sm leading-tight">FacilityPPM</p>
            <p className="text-blue-400 text-xs font-medium">Control Panel</p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        className={cn(
          'absolute -right-3 top-[3.625rem] z-20 flex h-7 w-7 items-center justify-center rounded-full border border-gray-700 bg-gray-800 text-gray-300 shadow-lg transition-all duration-200 hover:bg-gray-700 hover:text-white active:scale-95',
          collapsed
            ? 'translate-x-0 opacity-100'
            : 'translate-x-1 opacity-0 group-hover/sidebar:translate-x-0 group-hover/sidebar:opacity-100'
        )}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <span className={cn('text-lg leading-none transition-transform duration-200', collapsed ? 'rotate-0' : 'rotate-180')}>
          ›
        </span>
      </button>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <Link
          href="/provider/properties"
          title={collapsed ? 'Dashboard' : undefined}
          className={cn(
            'group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ease-out',
            collapsed && 'justify-center px-0',
            pathname.startsWith('/provider/properties')
              ? 'bg-blue-600 text-white shadow-sm shadow-blue-950/20'
              : 'text-gray-400 hover:translate-x-0.5 hover:text-white hover:bg-gray-800'
          )}
        >
          <LayoutDashboard className="w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
          <span className={cn('truncate transition-opacity duration-200', collapsed ? 'hidden' : 'inline')}>
            Dashboard
          </span>
        </Link>
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            title={collapsed ? label : undefined}
            className={cn(
              'group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ease-out',
              collapsed && 'justify-center px-0',
              pathname.startsWith(href)
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-950/20'
                : 'text-gray-400 hover:translate-x-0.5 hover:text-white hover:bg-gray-800'
            )}
          >
            <Icon className="w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
            <span className={cn('truncate transition-opacity duration-200', collapsed ? 'hidden' : 'inline')}>
              {label}
            </span>
          </Link>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-gray-700/50">
        <button
          onClick={handleSignOut}
          title={collapsed ? 'Sign out' : undefined}
          className="group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-all duration-200 ease-out hover:translate-x-0.5 w-full"
        >
          <LogOut className="w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
          <span className={cn('truncate transition-opacity duration-200', collapsed ? 'hidden' : 'inline')}>
            Sign out
          </span>
        </button>
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
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600">
                <span className="text-sm font-bold text-white">M</span>
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight text-white">FacilityPPM</p>
                <p className="text-xs font-medium text-blue-400">Control Panel</p>
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
            <Link
              href="/provider/properties"
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ease-out',
                pathname.startsWith('/provider/properties')
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-950/20'
                  : 'text-gray-400 hover:translate-x-0.5 hover:bg-gray-800 hover:text-white'
              )}
            >
              <Building2 className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
              Properties
            </Link>
          </nav>

          <div className="border-t border-gray-700/50 px-3 py-4">
            <button
              onClick={handleSignOut}
              className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-400 transition-all duration-200 ease-out hover:translate-x-0.5 hover:bg-gray-800 hover:text-white"
            >
              <LogOut className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
              Sign out
            </button>
          </div>
        </aside>
      </div>
    </>
  )
}
