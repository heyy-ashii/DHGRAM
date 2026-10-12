import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Send } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useUi } from '../context/UiContext'
import { api, errorMessage } from '../lib/api'
import type { ChatMessage } from '../lib/types'
import { cn, formatTime } from '../lib/utils'
import BrandName from './BrandName'
import { Spinner } from './ui'

// The one-to-one "Chat with Admin" thread. It lives inside the Messages page so
// support is reachable without a floating button on every page.
export default function AdminChat({ onBack }: { onBack?: () => void }) {
  const qc = useQueryClient()
  const { toast } = useUi()
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['chat', 'me'],
    queryFn: () => api<{ data: { messages: ChatMessage[] } }>('/chat/me'),
    refetchInterval: 5000,
  })
  const send = useMutation({
    mutationFn: (body: string) => api('/chat/me/messages', { method: 'POST', body: { body } }),
    onSuccess: () => {
      setText('')
      qc.invalidateQueries({ queryKey: ['chat'] })
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  })
  const messages = data?.data.messages ?? []

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (text.trim()) send.mutate(text.trim())
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-ink-200 p-4 dark:border-ink-800">
        <button className="btn-ghost p-2 md:hidden" onClick={onBack} aria-label="Back to conversations">
          <ArrowLeft className="size-4" />
        </button>
        <div className="min-w-0">
          <p className="truncate font-semibold"><BrandName /> support</p>
          <p className="truncate text-xs text-ink-500">We usually reply within a few hours</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-ink-50 p-4 dark:bg-ink-900/40">
        {isLoading ? (
          <div className="grid h-full place-items-center"><Spinner /></div>
        ) : messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-ink-500">Hi! Send a message and the <BrandName /> team will reply here.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((m) => (
              <div key={m._id} className={cn('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm', m.senderRole === 'user' ? 'self-end rounded-br-sm bg-brand text-white' : 'self-start rounded-bl-sm bg-white shadow-sm dark:bg-ink-800')}>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={cn('mt-1 text-[10px]', m.senderRole === 'user' ? 'text-blue-100' : 'text-ink-400')}>{formatTime(m.createdAt)}</p>
              </div>
            ))}
            <div ref={end} />
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2 border-t border-ink-200 p-3 dark:border-ink-800">
        <input className="input" placeholder="Type a message…" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} aria-label="Message" />
        <button type="submit" className="btn-primary px-3" disabled={send.isPending || !text.trim()} aria-label="Send">
          {send.isPending ? <Spinner className="size-4" /> : <Send className="size-4" />}
        </button>
      </form>
    </div>
  )
}
