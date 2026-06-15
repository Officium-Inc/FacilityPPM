'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, MessageSquare } from 'lucide-react'
import { formatPHT } from '@/lib/utils'

export interface WoComment {
  id: string
  author_name: string
  author_role: string
  message: string
  created_at: string
}

interface Props {
  workOrderId: string
  initialComments: WoComment[]
}

const ROLE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  head_engineer:   { bg: 'bg-green-100',  text: 'text-green-800',  label: 'Head Engineer' },
  'service group': { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Service Group' },
  tenant:          { bg: 'bg-blue-100',   text: 'text-blue-800',   label: 'Tenant' },
  admin:           { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Admin' },
  property_manager:{ bg: 'bg-indigo-100', text: 'text-indigo-800', label: 'Property Manager' },
  viewer:          { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Viewer' },
}

function getRoleStyle(role: string) {
  return ROLE_STYLES[role.toLowerCase()] ?? { bg: 'bg-gray-100', text: 'text-gray-600', label: role }
}

export default function WoCommentsSection({ workOrderId, initialComments }: Props) {
  const [comments, setComments] = useState<WoComment[]>(initialComments)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom on new comments
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = message.trim()
    if (!trimmed) return

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to post comment')
        return
      }

      // Re-fetch to get server-assigned name/role
      const listRes = await fetch(`/api/work-orders/${workOrderId}/comments`)
      if (listRes.ok) {
        const updated = await listRes.json()
        setComments(updated)
      }
      setMessage('')
    } catch {
      setError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-4 h-4 text-gray-400" />
        <h3 className="font-semibold text-gray-900 text-sm">
          Comments {comments.length > 0 && <span className="text-gray-400 font-normal">({comments.length})</span>}
        </h3>
      </div>

      {/* Thread */}
      <div className="space-y-3 max-h-96 overflow-y-auto pr-1 mb-4">
        {comments.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No comments yet. Start the conversation.</p>
        ) : (
          comments.map((c) => {
            const style = getRoleStyle(c.author_role)
            return (
              <div key={c.id} className="flex gap-3">
                {/* Avatar */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${style.bg} ${style.text}`}>
                  {c.author_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-900">{c.author_name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${style.bg} ${style.text}`}>
                      {style.label}
                    </span>
                    <span className="text-xs text-gray-400">{formatPHT(c.created_at, true)}</span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{c.message}</p>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit(e as unknown as React.FormEvent)
            }
          }}
          placeholder="Write a comment… (Enter to send, Shift+Enter for newline)"
          rows={2}
          disabled={submitting}
          className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={submitting || !message.trim()}
          className="flex-shrink-0 w-10 h-10 self-end flex items-center justify-center rounded-lg bg-green-700 hover:bg-green-800 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
      {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
    </div>
  )
}
