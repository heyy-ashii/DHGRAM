import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Send } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useUi } from '../context/UiContext'
import { api, errorMessage } from '../lib/api'
import type { ChatMessage, Conversation } from '../lib/types'
import { cn, formatShort, formatTime } from '../lib/utils'
import { PageSpinner, Spinner } from './ui'

// Admin side of the "Chat with Admin" inbox. Like AdminChat, it lives inside the
// Messages page rather than a separate /admin area.
function SupportThread({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient()
  const { toast } = useUi()
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['chat', 'conversation', id],
    queryFn: () => api<{ data: { conversation: Conversation; messages: ChatMessage[] } }>(`/chat/conversations/${id}/messages`).then((r) => r.data),
    refetchInterval: 5000,
  })
  const send = useMutation({
    mutationFn: (body: string) => api(`/chat/conversations/${id}/messages`, { method: 'POST', body: { body } }),
    onSuccess: () => {
      setText('')
      qc.invalidateQueries({ queryKey: ['chat'] })
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  })
  const setStatus = useMutation({
    mutationFn: (status: 'open' | 'closed') => api(`/chat/conversations/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat'] }),
  })
  const messages = data?.messages ?? []

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (text.trim()) send.mutate(text.trim())
  }

  if (isLoading || !data) return <PageSpinner />
  const { conversation } = data

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-2">
          <button className="btn-ghost p-2 md:hidden" onClick={onBack} aria-label="Back to conversations"><ArrowLeft className="size-4" /></button>
          <div className="min-w-0">
            <p className="truncate font-semibold">{conversation.user?.name ?? 'Deleted user'}</p>
            <p className="truncate text-xs text-slate-500">@{conversation.user?.username}{conversation.user?.email ? ` · ${conversation.user.email}` : ''}</p>
          </div>
        </div>
        <button className="btn-outline shrink-0 px-3 py-1.5 text-xs" onClick={() => setStatus.mutate(conversation.status === 'open' ? 'closed' : 'open')}>
          Mark {conversation.status === 'open' ? 'resolved' : 'open'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto bg-slate-50 p-4 dark:bg-slate-900/40">
        {messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-slate-500">No messages yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((m) => (
              <div key={m._id} className={cn('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm', m.senderRole === 'admin' ? 'self-end rounded-br-sm bg-brand text-white' : 'self-start rounded-bl-sm bg-white shadow-sm dark:bg-slate-800')}>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={cn('mt-1 text-[10px]', m.senderRole === 'admin' ? 'text-indigo-100' : 'text-slate-400')}>{formatTime(m.createdAt)}</p>
              </div>
            ))}
            <div ref={end} />
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-800">
        <input className="input" placeholder="Reply…" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} aria-label="Reply" />
        <button type="submit" className="btn-primary px-3" disabled={send.isPending || !text.trim()} aria-label="Send reply">
          {send.isPending ? <Spinner className="size-4" /> : <Send className="size-4" />}
        </button>
      </form>
    </div>
  )
}

export default function SupportInbox({ selected, onSelect, onBack }: { selected: string | null; onSelect: (id: string) => void; onBack: () => void }) {
  const [filter, setFilter] = useState<'open' | 'closed' | ''>('open')
  const { data, isLoading } = useQuery({
    queryKey: ['chat', 'conversations', filter],
    queryFn: () => api<{ data: { conversations: Conversation[] } }>('/chat/conversations', { query: { status: filter } }).then((r) => r.data.conversations),
    refetchInterval: 10000,
  })
  const conversations = data ?? []

  return (
    <>
      <div className={cn('flex min-h-0 flex-col border-r border-slate-200 dark:border-slate-800', selected && 'hidden md:flex')}>
        <div className="flex gap-1 border-b border-slate-200 p-2 dark:border-slate-800">
          {(['open', 'closed', ''] as const).map((f) => (
            <button key={f || 'all'} onClick={() => setFilter(f)} className={cn('flex-1 rounded-lg py-1.5 text-xs font-semibold capitalize', filter === f ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800')}>
              {f || 'all'}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <PageSpinner />
          ) : conversations.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">No conversations.</p>
          ) : (
            conversations.map((c) => (
              <button key={c._id} onClick={() => onSelect(c._id)} className={cn('flex w-full flex-col gap-0.5 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40', selected === c._id && 'bg-brand-soft dark:bg-brand/15')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{c.user?.name ?? 'Deleted user'}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">{formatShort(c.lastMessageAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-slate-500">{c.lastMessage}</span>
                  {c.unreadForAdmin > 0 && <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand text-[10px] font-bold text-white">{c.unreadForAdmin}</span>}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
      <div className={cn('min-h-0', !selected && 'hidden md:block')}>
        {selected ? (
          <SupportThread key={selected} id={selected} onBack={onBack} />
        ) : (
          <p className="grid h-full place-items-center p-8 text-center text-sm text-slate-500">Select a conversation.</p>
        )}
      </div>
    </>
  )
}
