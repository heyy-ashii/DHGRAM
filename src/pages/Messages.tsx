import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, MessageSquarePlus, Send, ShieldQuestion, Users } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AdminChat from '../components/AdminChat'
import Avatar from '../components/Avatar'
import { GroupAvatar, GroupThreadView, NewGroupModal, groupSubtitle } from '../components/GroupChat'
import SupportInbox from '../components/SupportInbox'
import { EmptyState, Modal, PageSpinner, Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { api, errorMessage } from '../lib/api'
import type { MessageThread } from '../lib/types'
import { usePageMeta } from '../lib/usePageMeta'
import { useGroups, useMessageThread, useMessageThreads, useStudentDirectory } from '../lib/queries'
import { cn, formatShort, formatTime } from '../lib/utils'

const ADMIN_KEY = 'admin'
const GROUP_PREFIX = 'g:'

function ThreadView({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient()
  const { toast } = useUi()
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const { data, isLoading } = useMessageThread(id)
  const send = useMutation({
    mutationFn: (body: string) => api(`/messages/${id}`, { method: 'POST', body: { body } }),
    onSuccess: () => {
      setText('')
      qc.invalidateQueries({ queryKey: ['messages'] })
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  })
  const messages = data?.messages ?? []
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (text.trim()) send.mutate(text.trim())
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-neutral-200 p-4 dark:border-neutral-800">
        <button className="btn-ghost p-2 md:hidden" onClick={onBack} aria-label="Back to conversations"><ArrowLeft className="size-4" /></button>
        {data?.conversation.peer && <Avatar user={data.conversation.peer} size="sm" />}
        <div className="min-w-0">
          <p className="truncate font-semibold">{data?.conversation.peer?.name ?? 'Conversation'}</p>
          {data?.conversation.peer?.username && <p className="truncate text-xs text-neutral-500">@{data.conversation.peer.username}</p>}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-neutral-50 p-4 dark:bg-neutral-900/40">
        {isLoading ? (
          <div className="grid h-full place-items-center"><Spinner /></div>
        ) : messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-neutral-500">Say hello to start the conversation.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((m) => (
              <div key={m._id} className={cn('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm', m.mine ? 'self-end rounded-br-sm bg-brand text-white' : 'self-start rounded-bl-sm bg-white shadow-sm dark:bg-neutral-800')}>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={cn('mt-1 text-[10px]', m.mine ? 'text-blue-100' : 'text-neutral-400')}>{formatTime(m.createdAt)}</p>
              </div>
            ))}
            <div ref={end} />
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2 border-t border-neutral-200 p-3 dark:border-neutral-800">
        <input className="input" placeholder="Type a message…" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} aria-label="Message" />
        <button type="submit" className="btn-primary px-3" disabled={send.isPending || !text.trim()} aria-label="Send">
          {send.isPending ? <Spinner className="size-4" /> : <Send className="size-4" />}
        </button>
      </form>
    </div>
  )
}

function NewChatPicker({ open, onClose, onStarted }: { open: boolean; onClose: () => void; onStarted: (id: string) => void }) {
  const qc = useQueryClient()
  const { toast } = useUi()
  const [q, setQ] = useState('')
  const { data, isLoading } = useStudentDirectory(q, open)
  const start = useMutation({
    mutationFn: (userId: string) => api<{ data: { conversation: MessageThread } }>('/messages/start', { method: 'POST', body: { userId } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['messages'] })
      onClose()
      onStarted(res.data.conversation._id)
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  })
  const users = data?.data.users ?? []

  return (
    <Modal open={open} onClose={onClose} title="New message">
      <label className="sr-only" htmlFor="new-chat-search">Search students</label>
      <input id="new-chat-search" className="input" placeholder="Search by name or username…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="mt-4 max-h-80 overflow-y-auto">
        {isLoading ? (
          <div className="grid place-items-center py-8"><Spinner /></div>
        ) : users.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">No students found.</p>
        ) : (
          users.map((u) => (
            <button
              key={u._id}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-800"
              disabled={start.isPending}
              onClick={() => start.mutate(u._id)}
            >
              <Avatar user={u} size="sm" />
              <div className="min-w-0">
                <p className="truncate font-medium">{u.name}</p>
                <p className="truncate text-xs text-neutral-500">@{u.username}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </Modal>
  )
}

export default function Messages() {
  usePageMeta('Messages')
  const qc = useQueryClient()
  const { toast } = useUi()
  const { user, isAdmin } = useAuth()
  const [params] = useSearchParams()
  const [selected, setSelected] = useState<string | null>(() => params.get('c'))
  const [picker, setPicker] = useState(false)
  const [groupPicker, setGroupPicker] = useState(false)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const { data: threads, isLoading } = useMessageThreads(Boolean(user) && !isAdmin)
  const { data: groups, isLoading: groupsLoading } = useGroups(Boolean(user) && !isAdmin)
  const { data: directory, isLoading: dirLoading } = useStudentDirectory(search, Boolean(user) && !isAdmin)

  const start = useMutation({
    mutationFn: (userId: string) => api<{ data: { conversation: MessageThread } }>('/messages/start', { method: 'POST', body: { userId } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['messages'] })
      setPicker(false)
      setSelected(res.data.conversation._id)
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  })

  // Show every other student in the list, not just existing conversations, so a
  // chat can be started straight from the sidebar.
  const list = useMemo(() => {
    const term = search.trim().toLowerCase()
    const conversations = (threads ?? []).filter((t) => {
      if (tab === 'unread' && t.unread === 0) return false
      if (!term) return true
      return t.peer?.name?.toLowerCase().includes(term) || t.peer?.username?.toLowerCase().includes(term) || t.lastMessage.toLowerCase().includes(term)
    })
    if (tab === 'unread') return conversations
    const seen = new Set(conversations.map((c) => c.peer?._id))
    const others = (directory?.data.users ?? []).filter((u) => !seen.has(u._id))
    return [...conversations, ...others]
  }, [threads, directory, search, tab])

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <EmptyState title="Log in to see your messages">
          <Link to="/login" className="btn-primary mt-2">Log in</Link>
        </EmptyState>
      </div>
    )
  }

  if (isAdmin) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-0 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4">
          <div className="flex items-center justify-between gap-3 px-4 pb-3 sm:px-0">
            <div>
              <h1 className="text-2xl font-extrabold">Messages</h1>
              <p className="mt-1 text-sm text-neutral-500">Reply to students who message the admin team.</p>
            </div>
          </div>
          <div className="card grid min-h-0 flex-1 overflow-hidden sm:rounded-2xl md:grid-cols-[340px_1fr]">
            <SupportInbox selected={selected} onSelect={setSelected} onBack={() => setSelected(null)} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-0 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4">
        <div className="flex items-center justify-between gap-3 px-4 pb-3 sm:px-0">
          <div>
            <h1 className="text-2xl font-extrabold">Messages</h1>
            <p className="mt-1 text-sm text-neutral-500">Chat privately with other students.</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-outline px-3" onClick={() => setSelected(ADMIN_KEY)}>
              <ShieldQuestion className="size-4" /> Support
            </button>
            <button className="btn-outline px-3" onClick={() => setGroupPicker(true)}>
              <Users className="size-4" /> Group
            </button>
            <button className="btn-primary px-3" onClick={() => setPicker(true)}>
              <MessageSquarePlus className="size-4" /> New
            </button>
          </div>
        </div>

        <div className="card grid min-h-0 flex-1 overflow-hidden sm:rounded-2xl md:grid-cols-[340px_1fr]">
          <div className={cn('flex min-h-0 flex-col border-r border-neutral-200 dark:border-neutral-800', selected && 'hidden md:flex')}>
          <div className="border-b border-neutral-200 p-3 dark:border-neutral-800">
            <input className="input" placeholder="Search messages" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search messages" />
            <div className="mt-2 flex gap-1">
              {(['all', 'unread'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn('flex-1 rounded-lg py-1.5 text-xs font-semibold capitalize', tab === t ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800')}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {!search.trim() && tab === 'all' && (groupsLoading || (groups ?? []).length > 0) && (
              <div className="border-b border-neutral-100 dark:border-neutral-800">
                <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Groups</p>
                {(groups ?? []).map((g) => (
                  <button
                    key={g._id}
                    onClick={() => setSelected(GROUP_PREFIX + g._id)}
                    className={cn('flex w-full items-center gap-3 border-b border-neutral-100 px-4 py-3 text-left hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/40', selected === GROUP_PREFIX + g._id && 'bg-blue-50 dark:bg-blue-950/40')}
                  >
                    <GroupAvatar group={g} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold">{g.name}</span>
                        <span className="shrink-0 text-[11px] text-neutral-400">{formatShort(g.lastMessageAt)}</span>
                      </div>
                      <span className="block truncate text-sm text-neutral-500">{g.lastMessage || groupSubtitle(g)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setSelected(ADMIN_KEY)}
              className={cn('flex w-full items-center gap-3 border-b border-neutral-100 px-4 py-3 text-left hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/40', selected === ADMIN_KEY && 'bg-blue-50 dark:bg-blue-950/40')}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
                <ShieldQuestion className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <span className="truncate font-semibold">Support</span>
                <span className="block truncate text-sm text-neutral-500">Chat with the admin team</span>
              </div>
            </button>
            {isLoading || dirLoading ? (
              <PageSpinner />
            ) : list.length === 0 && (search.trim() || tab === 'unread' || (groups ?? []).length === 0) ? (
              <div className="p-6 text-center text-sm text-neutral-500">
                {search.trim() || tab === 'unread' ? 'Nothing matches that filter.' : (
                  <>
                    <p>No students yet.</p>
                    <button className="btn-outline mt-3" onClick={() => setPicker(true)}>Start one</button>
                  </>
                )}
              </div>
            ) : (
              list.map((item) => {
                const isThread = 'peer' in item
                const peer = isThread ? item.peer : item
                return (
                  <button
                    key={item._id}
                    onClick={() => (isThread ? setSelected(item._id) : start.mutate(peer._id))}
                    disabled={!isThread && start.isPending}
                    className={cn('flex w-full items-center gap-3 border-b border-neutral-100 px-4 py-3 text-left hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/40', isThread && selected === item._id && 'bg-blue-50 dark:bg-blue-950/40')}
                  >
                    <Avatar user={peer} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold">{peer.name ?? 'Student'}</span>
                        {isThread && <span className="shrink-0 text-[11px] text-neutral-400">{formatShort(item.lastMessageAt)}</span>}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm text-neutral-500">{isThread ? item.lastMessage || 'No messages yet' : peer.username ? `@${peer.username}` : 'Start a chat'}</span>
                        {isThread && item.unread > 0 && <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand text-[10px] font-bold text-white">{item.unread}</span>}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
        <div className={cn('min-h-0', !selected && 'hidden md:block')}>
          {selected === ADMIN_KEY ? (
            <AdminChat onBack={() => setSelected(null)} />
          ) : selected?.startsWith(GROUP_PREFIX) ? (
            <GroupThreadView key={selected} id={selected.slice(GROUP_PREFIX.length)} onBack={() => setSelected(null)} />
          ) : selected ? (
            <ThreadView key={selected} id={selected} onBack={() => setSelected(null)} />
          ) : (
            <div className="grid h-full place-items-center p-8 text-center text-sm text-neutral-500">
              <div>
                <MessageSquarePlus className="mx-auto mb-2 size-6 opacity-40" aria-hidden />
                Select a conversation, or start a new one.
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      <NewChatPicker open={picker} onClose={() => setPicker(false)} onStarted={(id) => setSelected(id)} />
      <NewGroupModal open={groupPicker} onClose={() => setGroupPicker(false)} onCreated={(id) => setSelected(GROUP_PREFIX + id)} />
    </div>
  )
}
