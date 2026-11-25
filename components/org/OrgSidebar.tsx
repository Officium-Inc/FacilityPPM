'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Building2, LogOut, Menu, Settings, Users, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

interface Props {
  orgSlug: string
  organizationName: string
}

/** Navigation of the org portal (`/org/[orgSlug]`). */
export default function OrgSidebar({ orgSlug, organizationName }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const base = `/org/${orgSlug}`
  const nav = [
    { href: base, label: 'Properties', icon: Building2, exact: true },
    { href: `${base}/members`, label: 'Administrators', icon: Users, exact: false },
    { href: `${base}/settings`, label: 'Settings', icon: Settings, exact: false },
  ]

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const links = nav.map(({ href, label, icon: Icon, exact }) => {
    const active = exact ? pathname === href : pathname.startsWith(href)
    return (
      <Link
        key={href}
        href={href}
        className={cn(
          'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ease-out',
          active ? 'bg-blue-600 text-white shadow-sm shadow-blue-950/20' : 'text-gray-400 hover:translate-x-0.5 hover:bg-gray-800 hover:text-white'
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {label}
      </Link>
    )
  })

  const brand = (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600">
        <span className="text-sm font-bold text-white">T</span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold leading-tight text-white">{organizationName}</p>
        <p className="text-xs font-medium text-blue-400">Organization</p>
      </div>
    </div>
  )

  const signOut = (
    <button
      onClick={handleSignOut}
      className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-400 transition-all duration-200 ease-out hover:translate-x-0.5 hover:bg-gray-800 hover:text-white"
    >
      <LogOut className="h-4 w-4 shrink-0" />
      Sign out
    </button>
  )

  return (
    <>
      <aside className="hidden min-h-screen w-60 shrink-0 flex-col bg-gray-900 md:flex">
        <div className="border-b border-gray-700/50 px-5 py-5">{brand}</div>
        <nav className="flex-1 space-y-0.5 px-3 py-4">{links}</nav>
        <div className="border-t border-gray-700/50 px-3 py-4">{signOut}</div>
      </aside>

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-50 inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 md:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className={cn('fixed inset-0 z-[80] md:hidden', mobileOpen ? 'pointer-events-auto' : 'pointer-events-none')} aria-hidden={!mobileOpen}>
        <button
          type="button"
          className={cn('absolute inset-0 bg-black/40 transition-opacity duration-200', mobileOpen ? 'opacity-100' : 'opacity-0')}
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        />
        <aside className={cn('relative flex h-full w-72 max-w-[85vw] flex-col bg-gray-900 shadow-2xl transition-transform duration-300', mobileOpen ? 'translate-x-0' : '-translate-x-full')}>
          <div className="flex items-center justify-between border-b border-gray-700/50 px-5 py-4">
            {brand}
            <button type="button" onClick={() => setMobileOpen(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white" aria-label="Close navigation">
              <X className="h-4 w-4" />
            </button>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">{links}</nav>
          <div className="border-t border-gray-700/50 px-3 py-4">{signOut}</div>
        </aside>
      </div>
    </>
  )
}
