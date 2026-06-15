'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Bell, ChevronDown, Check, ArrowLeftRight, AtSign, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatPHT } from '@/lib/utils'

const switchOverlayStyles = `
@keyframes fadeInOverlay {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes scaleInSpinner {
  from { opacity: 0; transform: scale(0.85); }
  to   { opacity: 1; transform: scale(1); }
}
.switch-overlay { animation: fadeInOverlay 0.2s ease forwards; }
.switch-spinner { animation: scaleInSpinner 0.25s ease forwards; }
@keyframes dropdownIn {
  from { opacity: 0; transform: translateY(-6px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.dropdown-enter { animation: dropdownIn 0.15s ease forwards; }
`

interface PropertyOption {
  id: string
  name: string
  slug: string
}

interface Notification {
  id: string
  type: string
  title: string
  message: string
  link: string | null
  read: boolean
  created_at: string
}

export default function TopbarClient({
  title,
  userEmail,
  signOutPath = '/provider/login',
  currentSlug,
  properties = [],
  unreadNotifications = 0,
}: {
  title?: string
  userEmail: string
  signOutPath?: string
  currentSlug?: string
  properties?: PropertyOption[]
  unreadNotifications?: number
}) {
  const router = useRouter()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [switchingTo, setSwitchingTo] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Notification state
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unread, setUnread] = useState(unreadNotifications)
  const [notifLoading, setNotifLoading] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchNotifications = useCallback(async () => {
    setNotifLoading(true)
    try {
      const res = await fetch('/api/notifications')
      if (res.ok) {
        const data: Notification[] = await res.json()
        setNotifications(data)
        setUnread(data.filter((n) => !n.read).length)
      }
    } finally {
      setNotifLoading(false)
    }
  }, [])

  async function openNotifications() {
    setNotifOpen((prev) => !prev)
    if (!notifOpen) {
      await fetchNotifications()
    }
  }

  async function markAllRead() {
    await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnread(0)
  }

  function handleNotifClick(n: Notification) {
    if (!n.read) {
      fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [n.id] }) })
        .then(() => {
          setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, read: true } : x))
          setUnread((u) => Math.max(0, u - 1))
        })
    }
    if (n.link) {
      setNotifOpen(false)
      router.push(n.link)
    }
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push(signOutPath)
    router.refresh()
  }

  async function handleSwitchProperty(targetSlug: string, targetId: string, targetName: string) {
    if (targetSlug === currentSlug || switching) return
    setSwitching(true)
    setSwitchingTo(targetName)
    setDropdownOpen(false)

    try {
      await fetch('/api/switch-property', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: targetSlug, propertyId: targetId }),
      })
      const supabase = createClient()
      await supabase.auth.refreshSession()
      window.location.assign(`/${targetSlug}`)
    } catch {
      setSwitching(false)
      setSwitchingTo(null)
    }
  }

  const showSwitcher = properties.length > 1

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
      <style>{switchOverlayStyles}</style>

      {/* Full-page switching overlay */}
      {switching && (
        <div className="switch-overlay fixed inset-0 z-[9999] bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
          <div className="switch-spinner flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-4 border-green-200 border-t-green-600 animate-spin" />
            <p className="text-sm font-medium text-gray-700">
              Switching to <span className="text-green-600">{switchingTo}</span>…
            </p>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <h1 className="text-base font-semibold text-gray-900">{title}</h1>

        {showSwitcher && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((o) => !o)}
              disabled={switching}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-md hover:bg-gray-100 transition-colors disabled:opacity-50"
              title="Switch property"
            >
              <ArrowLeftRight className="w-3 h-3" />
              <ChevronDown className={`w-3 h-3 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {dropdownOpen && (
              <div className="dropdown-enter absolute left-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                <p className="px-3 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Switch Property
                </p>
                {properties.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSwitchProperty(p.slug, p.id, p.name)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <span className="truncate">{p.name}</span>
                    {p.slug === currentSlug && (
                      <Check className="w-3.5 h-3.5 text-green-600 shrink-0 ml-2" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Notification bell */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={openNotifications}
            className="relative text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white leading-none">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="dropdown-enter absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-900">Notifications</span>
                {unread > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-xs text-green-600 hover:text-green-700 font-medium"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
                {notifLoading ? (
                  <div className="py-8 flex items-center justify-center">
                    <div className="w-5 h-5 rounded-full border-2 border-green-200 border-t-green-600 animate-spin" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="py-8 text-center">
                    <Bell className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No notifications yet</p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleNotifClick(n)}
                      className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex gap-3 ${!n.read ? 'bg-blue-50/50' : ''}`}
                    >
                      <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5 ${n.type === 'mention' ? 'bg-blue-100' : 'bg-gray-100'}`}>
                        {n.type === 'mention' ? (
                          <AtSign className="w-3.5 h-3.5 text-blue-600" />
                        ) : (
                          <Bell className="w-3.5 h-3.5 text-gray-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm leading-snug ${!n.read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                            {n.title}
                          </p>
                          {!n.read && <span className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-1" />}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                        <p className="text-xs text-gray-400 mt-1">{formatPHT(n.created_at, true)}</p>
                      </div>
                      {n.link && <ExternalLink className="flex-shrink-0 w-3.5 h-3.5 text-gray-300 mt-1" />}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <div className="w-7 h-7 bg-green-100 rounded-full flex items-center justify-center">
            <span className="text-green-700 font-medium text-xs uppercase">
              {userEmail.charAt(0)}
            </span>
          </div>
          <span className="hidden sm:inline">{userEmail}</span>
        </div>
        <button
          onClick={handleSignOut}
          className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          title="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
