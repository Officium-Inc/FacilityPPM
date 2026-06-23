import { FileText } from 'lucide-react'
import TenantPlaceholder from '@/components/tenant/TenantPlaceholder'

export default function GatePassPage() {
  return (
    <TenantPlaceholder
      title="Gate Pass"
      description="Request form for gate pass submissions."
      icon={<FileText className="h-5 w-5" />}
    />
  )
}
