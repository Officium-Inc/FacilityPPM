'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, MessageSquare } from 'lucide-react'
import { formatPHT } from '@/lib/utils'
import { formatRoleName, normalizeRoleName } from '@/lib/roles'

export interface WoComment {
  id: string
  author_name: string
  author_role: string
  message: string
  created_at: string
}

export interface MentionableEngineer {
  id: string
  full_name: string
}

interface Props {
  workOrderId: string
  initialComments: WoComment[]
  mentionables: MentionableEngineer[]
}

const ROLE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  head_engineer:    { bg: 'bg-green-100',  text: 'text-green-800',  label: 'Head Engineer' },
  'service group':  { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Service Group' },
  tenant:           { bg: 'bg-blue-100',   text: 'text-blue-800',   label: 'Tenant' },
  admin:            { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Admin' },
  property_manager: { bg: 'bg-indigo-100', text: 'text-indigo-800', label: 'Property Manager' },
  viewer:           { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Viewer' },
}

function getRoleStyle(role: string) {
  const normalized = normalizeRoleName(role)
  return ROLE_STYLES[normalized] ?? { bg: 'bg-gray-100', text: 'text-gray-600', label: formatRoleName(normalized) }
}

/** Render a comment body with @mentions highlighted in blue */
function CommentBody({ text }: { text: string }) {
  const parts = text.split(/(@[A-Za-z][A-Za-z0-9 ]*)/g)
  return (
    <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
      {parts.map((part, i) =>
        part.startsWith('@') ? (
          <span key={i} className="text-blue-600 font-medium">{part}</span>
        ) : (
          part
        )
      )}
    </p>
  )
}

export default function WoCommentsSection({ workOrderId, initialComments, mentionables }: Props) {
  const [comments, setComments] = useState<WoComment[]>(initialComments)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // @mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState<number>(-1)
  const [suggestionIndex, setSuggestionIndex] = useState(0)

  const suggestions = mentionQuery !== null
    ? mentionables.filter((e) =>
        e.full_name.toLowerCase().includes(mentionQuery.toLowerCase())
      ).slice(0, 5)
    : []

  // Scroll to bottom on new comments
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  // Detect @mention as user types
  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setMessage(val)

    const cursor = e.target.selectionStart ?? val.length
    // Look back from cursor for '@'
    const textBeforeCursor = val.slice(0, cursor)
    const atIndex = textBeforeCursor.lastIndexOf('@')

    if (atIndex !== -1) {
      const fragment = textBeforeCursor.slice(atIndex + 1)
      // Only show if no space in fragment (or space within a name match)
      if (!fragment.includes('  ') && fragment.length <= 40) {
        setMentionQuery(fragment)
        setMentionStart(atIndex)
        setSuggestionIndex(0)
        return
      }
    }
    setMentionQuery(null)
  }, [])

  function insertMention(name: string) {
    if (mentionStart === -1) return
    const before = message.slice(0, mentionStart)
    const cursor = textareaRef.current?.selectionStart ?? message.length
    const after = message.slice(cursor)
    const newVal = `${before}@${name} ${after}`
    setMessage(newVal)
    setMentionQuery(null)
    // Move cursor after inserted mention
    setTimeout(() => {
      const pos = before.length + name.length + 2 // '@' + name + space
      textareaRef.current?.setSelectionRange(pos, pos)
      textareaRef.current?.focus()
    }, 0)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSuggestionIndex((i) => (i + 1) % suggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSuggestionIndex((i) => (i - 1 + suggestions.length) % suggestions.length)
        return
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        insertMention(suggestions[suggestionIndex].full_name)
        return
      }
      if (e.key === 'Escape') {
        setMentionQuery(null)
        return
      }
    }

    // Enter to send (no mention menu open)
    if (e.key === 'Enter' && !e.shiftKey && mentionQuery === null) {
      e.preventDefault()
      void submitComment()
    }
  }

  async function submitComment() {
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
      setMentionQuery(null)
    } catch {
      setError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    void submitComment()
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-gray-400" />
        <h3 className="font-semibold text-gray-900 text-sm">
          Comments {comments.length > 0 && <span className="text-gray-400 font-normal">({comments.length})</span>}
        </h3>
      </div>

      {/* Thread */}
      <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1 mb-3">
        {comments.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No comments yet. Start the conversation.</p>
        ) : (
          comments.map((c) => {
            const style = getRoleStyle(c.author_role)
            return (
              <div key={c.id} className="flex gap-2.5">
                <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${style.bg} ${style.text}`}>
                  {c.author_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">{c.author_name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${style.bg} ${style.text}`}>
                      {style.label}
                    </span>
                    <span className="text-xs text-gray-400">{formatPHT(c.created_at, true)}</span>
                  </div>
                  <CommentBody text={c.message} />
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Compose with @mention autocomplete */}
      <div className="relative">
        {/* Mention suggestions popup */}
        {mentionQuery !== null && suggestions.length > 0 && (
          <div className="absolute bottom-full left-0 mb-1 w-60 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
            <p className="px-3 py-1.5 text-xs text-gray-400 font-medium border-b border-gray-100">Mention</p>
            {suggestions.map((eng, i) => (
              <button
                key={eng.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); insertMention(eng.full_name) }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${i === suggestionIndex ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                @{eng.full_name}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Write a comment… type @ to mention someone"
            rows={1}
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
        <p className="text-xs text-gray-400 mt-1.5">Enter to send · Shift+Enter for newline · @ to mention</p>
      </div>
    </div>
  )
}

