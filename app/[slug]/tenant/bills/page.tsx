import { ReceiptText } from 'lucide-react'
import TenantPlaceholder from '@/components/tenant/TenantPlaceholder'

export default function TenantBillsPage() {
  return (
    <TenantPlaceholder
      title="Bills"
      description="View tenant billing information and statements."
      icon={<ReceiptText className="h-5 w-5" />}
    />
  )
}
