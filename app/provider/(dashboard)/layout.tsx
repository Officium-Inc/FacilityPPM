import ProviderSidebar from '@/components/provider/Sidebar'
import { createClient } from '@/lib/supabase/server'

export default async function ProviderDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="flex h-dvh overflow-hidden bg-gray-50">
      <ProviderSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white pl-14 pr-3 sm:pr-6 md:pl-6">
          <h1 className="truncate text-sm font-semibold text-gray-900 sm:text-base">Control Panel</h1>
          <span className="truncate text-sm text-gray-500">{user?.email}</span>
        </header>
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="min-h-full p-4 sm:p-6">{children}</div>
        </main>
      </div>
    </div>
  )
}
