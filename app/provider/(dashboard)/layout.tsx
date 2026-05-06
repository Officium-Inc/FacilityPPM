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
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <ProviderSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
          <h1 className="text-base font-semibold text-gray-900">Provider Dashboard</h1>
          <span className="text-sm text-gray-500">{user?.email}</span>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
