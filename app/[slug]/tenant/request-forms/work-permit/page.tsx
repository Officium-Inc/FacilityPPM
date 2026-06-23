import { FileCheck2 } from 'lucide-react'
import TenantPlaceholder from '@/components/tenant/TenantPlaceholder'

export default function WorkPermitPage() {
  return (
    <TenantPlaceholder
      title="Work Permit"
      description="Request form for tenant work permits."
      icon={<FileCheck2 className="h-5 w-5" />}
    />
  )
}
