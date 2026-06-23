import { Settings } from 'lucide-react'
import TenantPlaceholder from '@/components/tenant/TenantPlaceholder'

export default function TenantSettingsPage() {
  return (
    <TenantPlaceholder
      title="Settings"
      description="Tenant portal account and preference settings."
      icon={<Settings className="h-5 w-5" />}
    />
  )
}
