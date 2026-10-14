import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Search, Send } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useUi } from '../context/UiContext'
import { api, errorMessage } from '../lib/api'
import { useSupportDirectory } from '../lib/queries'
import type { ChatMessage, Conversation } from '../lib/types'
import { cn, formatShort, formatTime } from '../lib/utils'
import Avatar from './Avatar'
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
      <header className="flex items-center justify-between gap-3 border-b border-ink-200 p-4 dark:border-ink-800">
        <div className="flex min-w-0 items-center gap-2">
          <button className="btn-ghost p-2 md:hidden" onClick={onBack} aria-label="Back to conversations"><ArrowLeft className="size-4" /></button>
          <div className="min-w-0">
            <p className="truncate font-semibold">{conversation.user?.name ?? 'Deleted user'}</p>
            <p className="truncate text-xs text-ink-500">@{conversation.user?.username}{conversation.user?.email ? ` · ${conversation.user.email}` : ''}</p>
          </div>
        </div>
        <button className="btn-outline shrink-0 px-3 py-1.5 text-xs" onClick={() => setStatus.mutate(conversation.status === 'open' ? 'closed' : 'open')}>
          Mark {conversation.status === 'open' ? 'resolved' : 'open'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto bg-ink-50 p-4 dark:bg-ink-900/40">
        {messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-ink-500">No messages yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((m) => (
              <div key={m._id} className={cn('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm', m.senderRole === 'admin' ? 'self-end rounded-br-sm bg-brand text-white' : 'self-start rounded-bl-sm bg-white shadow-sm dark:bg-ink-800')}>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={cn('mt-1 text-[10px]', m.senderRole === 'admin' ? 'text-blue-100' : 'text-ink-400')}>{formatTime(m.createdAt)}</p>
              </div>
            ))}
            <div ref={end} />
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2 border-t border-ink-200 p-3 dark:border-ink-800">
        <input className="input" placeholder="Reply…" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} aria-label="Reply" />
        <button type="submit" className="btn-primary px-3" disabled={send.isPending || !text.trim()} aria-label="Send reply">
          {send.isPending ? <Spinner className="size-4" /> : <Send className="size-4" />}
        </button>
      </form>
    </div>
  )
}

export default function SupportInbox({ selected, onSelect, onBack }: { selected: string | null; onSelect: (id: string) => void; onBack: () => void }) {
  const qc = useQueryClient()
  const { toast } = useUi()
  const [tab, setTab] = useState<'open' | 'closed' | 'all' | 'students'>('open')
  const [search, setSearch] = useState('')
  const showStudents = tab === 'students'
  const status = tab === 'all' ? '' : tab

  const { data, isLoading } = useQuery({
    queryKey: ['chat', 'conversations', status],
    queryFn: () => api<{ data: { conversations: Conversation[] } }>('/chat/conversations', { query: { status } }).then((r) => r.data.conversations),
    refetchInterval: 10000,
    enabled: !showStudents,
  })
  const conversations = data ?? []

  // "All students" lists everyone on the roster, not just people who wrote in, so
  // an admin can start a thread with anyone. `unanswered` narrows it to students
  // with no support thread yet.
  const [unansweredOnly, setUnansweredOnly] = useState(false)
  const directory = useSupportDirectory(search, unansweredOnly, showStudents)
  const students = directory.data?.pages.flatMap((p) => p.data.students) ?? []

  const start = useMutation({
    mutationFn: (userId: string) =>
      api<{ data: { conversation: Conversation } }>('/admin/support/conversations', { method: 'POST', body: { userId } }).then((r) => r.data.conversation),
    onSuccess: (conversation) => {
      qc.invalidateQueries({ queryKey: ['chat'] })
      qc.invalidateQueries({ queryKey: ['admin', 'support', 'directory'] })
      onSelect(conversation._id)
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  })

  const openStudent = (student: (typeof students)[number]) => {
    if (student.conversationId) onSelect(student.conversationId)
    else start.mutate(student._id)
  }

  const TABS = [
    { key: 'open', label: 'open' },
    { key: 'closed', label: 'closed' },
    { key: 'all', label: 'all' },
    { key: 'students', label: 'students' },
  ] as const

  return (
    <>
      <div className={cn('flex min-h-0 flex-col border-r border-ink-200 dark:border-ink-800', selected && 'hidden md:flex')}>
        <div className="flex gap-1 border-b border-ink-200 p-2 dark:border-ink-800">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={cn('flex-1 rounded-lg py-1.5 text-xs font-semibold capitalize', tab === t.key ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800')}>
              {t.label}
            </button>
          ))}
        </div>

        {showStudents && (
          <div className="flex flex-col gap-2 border-b border-ink-200 p-3 dark:border-ink-800">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
              <input className="input pl-9" placeholder="Search students" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search students" />
            </div>
            <button onClick={() => setUnansweredOnly((v) => !v)} className={cn('self-start rounded-lg px-2.5 py-1 text-xs font-semibold', unansweredOnly ? 'bg-brand text-white' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800')}>
              {unansweredOnly ? '✓ ' : ''}Never messaged
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {showStudents ? (
            directory.isLoading ? (
              <PageSpinner />
            ) : students.length === 0 ? (
              <p className="p-6 text-center text-sm text-ink-500">No students match that search.</p>
            ) : (
              <>
                {students.map((s) => (
                  <button
                    key={s._id}
                    onClick={() => openStudent(s)}
                    disabled={start.isPending}
                    className={cn('flex w-full items-center gap-3 border-b border-ink-100 px-4 py-3 text-left hover:bg-ink-50 disabled:opacity-50 dark:border-ink-800 dark:hover:bg-ink-800/40', s.conversationId && selected === s.conversationId && 'bg-blue-50 dark:bg-blue-950/40')}
                  >
                    <Avatar user={s} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold">{s.name}</span>
                        {s.lastMessageAt && <span className="shrink-0 text-[11px] text-ink-400">{formatShort(s.lastMessageAt)}</span>}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm text-ink-500">
                          {s.conversationId ? s.lastMessage || 'No messages yet' : s.regNo ? `Reg. ${s.regNo}` : `@${s.username}`}
                        </span>
                        {s.unreadForAdmin > 0 && <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand text-[10px] font-bold text-white">{s.unreadForAdmin}</span>}
                      </div>
                    </div>
                  </button>
                ))}
                {directory.hasNextPage && (
                  <button className="btn-outline mx-3 my-3 w-[calc(100%-1.5rem)] py-2 text-xs" onClick={() => directory.fetchNextPage()} disabled={directory.isFetchingNextPage}>
                    {directory.isFetchingNextPage ? 'Loading…' : `Load more (${students.length} of ${directory.data?.pages[0]?.total ?? students.length})`}
                  </button>
                )}
              </>
            )
          ) : isLoading ? (
            <PageSpinner />
          ) : conversations.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink-500">No conversations.</p>
          ) : (
            conversations.map((c) => (
              <button key={c._id} onClick={() => onSelect(c._id)} className={cn('flex w-full flex-col gap-0.5 border-b border-ink-100 px-4 py-3 text-left hover:bg-ink-50 dark:border-ink-800 dark:hover:bg-ink-800/40', selected === c._id && 'bg-blue-50 dark:bg-blue-950/40')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{c.user?.name ?? 'Deleted user'}</span>
                  <span className="shrink-0 text-[11px] text-ink-400">{formatShort(c.lastMessageAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-ink-500">{c.lastMessage}</span>
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
          <p className="grid h-full place-items-center p-8 text-center text-sm text-ink-500">Select a conversation.</p>
        )}
      </div>
    </>
  )
}
