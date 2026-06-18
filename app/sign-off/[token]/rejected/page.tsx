import { XCircle } from 'lucide-react'

export default function SignOffRejectedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-sm text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <XCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Concern Submitted</h2>
        <p className="text-sm text-gray-500 mb-4">
          Tenant360 has been notified. A corrective work order has been raised
          to address your concern.
        </p>
        <p className="text-xs text-gray-400">
          You will be contacted once the remedial work has been completed and a new sign-off
          request will be sent.
        </p>
      </div>
    </div>
  )
}
