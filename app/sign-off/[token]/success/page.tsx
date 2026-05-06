import { CheckCircle } from 'lucide-react'

export default function SignOffSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-sm text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Signed Off Successfully</h2>
        <p className="text-sm text-gray-500 mb-4">
          Thank you. Your sign-off has been recorded. A tamper-evident receipt has been generated
          and stored securely.
        </p>
        <p className="text-xs text-gray-400">
          You will receive a copy of the signed receipt by email. Contact Marajo Property
          Management if you have any questions.
        </p>
      </div>
    </div>
  )
}
