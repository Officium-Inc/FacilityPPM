'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Bell, ChevronDown, Check, ArrowLeftRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface PropertyOption {
  id: string
  name: string
  slug: string
}

export default function TopbarClient({
  title,
  userEmail,
  signOutPath = '/provider/login',
  currentSlug,
  properties = [],
}: {
  title?: string
  userEmail: string
  signOutPath?: string
  currentSlug?: string
  properties?: PropertyOption[]
}) {
  const router = useRouter()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push(signOutPath)
    router.refresh()
  }

  async function handleSwitchProperty(targetSlug: string) {
    if (targetSlug === currentSlug || switching) return
    setSwitching(true)
    setDropdownOpen(false)

    try {
      await fetch('/api/switch-property', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: targetSlug }),
      })
      const supabase = createClient()
      await supabase.auth.refreshSession()
      router.push(`/${targetSlug}`)
      router.refresh()
    } finally {
      setSwitching(false)
    }
  }

  const showSwitcher = properties.length > 1

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
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
              <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                <p className="px-3 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Switch Property
                </p>
                {properties.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSwitchProperty(p.slug)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <span className="truncate">{p.name}</span>
                    {p.slug === currentSlug && (
                      <Check className="w-3.5 h-3.5 text-blue-600 shrink-0 ml-2" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <Bell className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center">
            <span className="text-blue-700 font-medium text-xs uppercase">
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
