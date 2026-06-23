'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

export default function ProviderMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const mainRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0 })
  }, [pathname])

  return (
    <main ref={mainRef} className="flex-1 overflow-y-auto bg-gray-50">
      <div className="min-h-full p-4 sm:p-6">{children}</div>
    </main>
  )
}
