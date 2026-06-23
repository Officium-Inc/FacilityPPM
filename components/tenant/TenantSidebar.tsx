'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Ban,
  CheckCircle,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileCheck2,
  FileText,
  LayoutDashboard,
  Menu,
  ReceiptText,
  Settings,
  Users,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type ChildItem = { href: string; label: string; icon: React.ElementType }
type NavItem = ChildItem & { children?: ChildItem[] }

export default function TenantSidebar({
  slug,
  propertyName,
}: {
  slug: string
  propertyName: string
}) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const base = `/${slug}/tenant`

  const nav = useMemo<NavItem[]>(() => [
    { href: base, label: 'Dashboard', icon: LayoutDashboard },
    {
      href: `${base}/service-requests`,
      label: 'Service Request',
      icon: ClipboardList,
      children: [
        { href: `${base}/service-requests/my-requests`, label: 'My Request', icon: ClipboardList },
        { href: `${base}/service-requests/pending`, label: 'Pending', icon: Clock },
        { href: `${base}/service-requests/for-my-approval`, label: 'For My Approval', icon: ClipboardCheck },
        { href: `${base}/service-requests/complete`, label: 'Complete', icon: CheckCircle },
        { href: `${base}/service-requests/cancelled`, label: 'Cancelled', icon: Ban },
      ],
    },
    {
      href: `${base}/request-forms`,
      label: 'Request Forms',
      icon: FileText,
      children: [
        { href: `${base}/request-forms/work-permit`, label: 'Work Permit', icon: FileCheck2 },
        { href: `${base}/request-forms/gate-pass`, label: 'Gate Pass', icon: FileText },
      ],
    },
    { href: `${base}/bills`, label: 'Bills', icon: ReceiptText },
    { href: `${base}/visitors`, label: 'Visitors', icon: Users },
    { href: `${base}/settings`, label: 'Settings', icon: Settings },
  ], [base])

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
      <aside className="hidden h-dvh w-64 shrink-0 flex-col bg-gray-900 md:flex">
        <Brand propertyName={propertyName} />
        <TenantNav nav={nav} pathname={pathname} base={base} />
        <Footer />
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
            <BrandInner propertyName={propertyName} />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="rounded-lg p-1.5 text-gray-400 transition-all duration-200 hover:bg-gray-800 hover:text-white active:scale-95"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <TenantNav nav={nav} pathname={pathname} base={base} />
          <Footer />
        </aside>
      </div>
    </>
  )
}

function Brand({ propertyName }: { propertyName: string }) {
  return (
    <div className="border-b border-gray-700/50 px-6 py-5">
      <BrandInner propertyName={propertyName} />
    </div>
  )
}

function BrandInner({ propertyName }: { propertyName: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-600">
        <span className="text-sm font-bold text-white">T</span>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-tight text-white">Tenant360</p>
        <p className="truncate text-xs text-gray-400">{propertyName}</p>
      </div>
    </div>
  )
}

function TenantNav({
  nav,
  pathname,
  base,
}: {
  nav: NavItem[]
  pathname: string
  base: string
}) {
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {nav.map((item) => {
        const active = item.href === base ? pathname === base : pathname.startsWith(item.href)
        if (item.children?.length) {
          return <NavGroup key={item.href} item={item} active={active} pathname={pathname} />
        }
        return <NavLink key={item.href} item={item} active={active} />
      })}
    </nav>
  )
}

function NavGroup({
  item,
  active,
  pathname,
}: {
  item: NavItem
  active: boolean
  pathname: string
}) {
  const [open, setOpen] = useState(active)
  const Icon = item.icon

  useEffect(() => {
    if (active) setOpen(true)
  }, [active])

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ease-out',
          active ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-1 space-y-0.5 pl-4">
          {item.children?.map((child) => (
            <NavLink
              key={child.href}
              item={child}
              active={pathname === child.href || pathname.startsWith(`${child.href}/`)}
              nested
            />
          ))}
        </div>
      )}
    </div>
  )
}

function NavLink({
  item,
  active,
  nested,
}: {
  item: ChildItem
  active: boolean
  nested?: boolean
}) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ease-out',
        nested && 'py-2 text-xs',
        active
          ? 'bg-green-600 text-white shadow-sm shadow-green-950/20'
          : 'text-gray-400 hover:translate-x-0.5 hover:bg-gray-800 hover:text-white'
      )}
    >
      <Icon className={cn('shrink-0 transition-transform duration-200 group-hover:scale-110', nested ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

function Footer() {
  return (
    <div className="border-t border-gray-700/50 px-3 py-4">
      <p className="px-3 text-xs text-gray-500">Tenant Portal</p>
    </div>
  )
}
