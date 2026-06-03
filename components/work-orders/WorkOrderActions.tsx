'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { WorkOrder } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { Send, ExternalLink, Download, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'

interface WorkOrderActionsProps {
  workOrder: WorkOrder
}

export default function WorkOrderActions({ workOrder }: WorkOrderActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleStatusChange(newStatus: string) {
    setLoading(true)
    setMessage(null)
    const supabase = createClient()

    const updates: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('work_orders')
      .update(updates)
      .eq('id', workOrder.id)

    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      router.refresh()
    }
    setLoading(false)
  }

  async function handleSendSignOff() {
    setLoading(true)
    setMessage(null)

    const res = await fetch(`/api/work-orders/${workOrder.id}/send-sign-off`, {
      method: 'POST',
    })

    const data = await res.json()
    if (!res.ok) {
      setMessage({ type: 'error', text: data.error ?? 'Failed to send sign-off link' })
    } else {
      setMessage({ type: 'success', text: 'Sign-off link sent to tenant.' })
      router.refresh()
    }
    setLoading(false)
  }

  const { status } = workOrder

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <h3 className="font-semibold text-gray-900 text-sm">Actions</h3>

      {message && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {status === 'scheduled' && (
        <ActionButton
          onClick={() => handleStatusChange('in_progress')}
          loading={loading}
          icon={RefreshCw}
          label="Mark In Progress"
          variant="primary"
        />
      )}

      {status === 'assigned' && (
        <ActionButton
          onClick={() => handleStatusChange('in_progress')}
          loading={loading}
          icon={RefreshCw}
          label="Mark In Progress"
          variant="primary"
        />
      )}

      {status === 'in_progress' && (
        <ActionButton
          onClick={() => handleStatusChange('completed')}
          loading={loading}
          icon={RefreshCw}
          label="Submit for Sign-Off"
          variant="primary"
        />
      )}

      {status === 'completed' && !workOrder.sign_off_token && (
        <ActionButton
          onClick={handleSendSignOff}
          loading={loading}
          icon={Send}
          label="Send Sign-Off Link"
          variant="primary"
        />
      )}

      {status === 'completed' && workOrder.sign_off_token && (
        <div className="space-y-2">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-sm text-yellow-800">
            Awaiting tenant sign-off
          </div>
          <a
            href={`${process.env.NEXT_PUBLIC_APP_URL}/sign-off/${workOrder.sign_off_token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-green-600 hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Preview sign-off page
          </a>
          <ActionButton
            onClick={handleSendSignOff}
            loading={loading}
            icon={Send}
            label="Resend Link"
            variant="secondary"
          />
        </div>
      )}

      {status === 'verified' && workOrder.pdf_url && (
        <a
          href={workOrder.pdf_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors w-full justify-center"
        >
          <Download className="w-4 h-4" />
          Download Signed Receipt
        </a>
      )}

      {(status === 'verified' || status === 'completed') && workOrder.signed_at && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-3 text-sm">
          <p className="font-medium text-green-800">Signed by tenant</p>
          <p className="text-green-700 mt-0.5">{workOrder.signed_by_name}</p>
          <p className="text-green-600 text-xs mt-0.5">
            {format(new Date(workOrder.signed_at), 'dd MMM yyyy HH:mm')}
          </p>
          {workOrder.signed_by_ip && (
            <p className="text-green-500 text-xs">IP: {workOrder.signed_by_ip}</p>
          )}
        </div>
      )}

      {workOrder.rejection_reason && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-3 text-sm">
          <p className="font-medium text-red-800">Rejection reason</p>
          <p className="text-red-700 mt-0.5">{workOrder.rejection_reason}</p>
        </div>
      )}
    </div>
  )
}

function ActionButton({
  onClick,
  loading,
  icon: Icon,
  label,
  variant = 'primary',
}: {
  onClick: () => void
  loading: boolean
  icon: React.ElementType
  label: string
  variant?: 'primary' | 'secondary'
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors w-full justify-center ${
        variant === 'primary'
          ? 'bg-green-700 hover:bg-green-800 disabled:bg-green-400 text-white'
          : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200'
      }`}
    >
      <Icon className="w-4 h-4" />
      {loading ? 'Please wait…' : label}
    </button>
  )
}
