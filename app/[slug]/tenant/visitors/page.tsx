import { Users } from 'lucide-react'
import TenantPlaceholder from '@/components/tenant/TenantPlaceholder'

export default function TenantVisitorsPage() {
  return (
    <TenantPlaceholder
      title="Visitors"
      description="Manage visitor information and passes."
      icon={<Users className="h-5 w-5" />}
    />
  )
}
