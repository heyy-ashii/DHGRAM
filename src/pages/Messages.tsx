import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, MessageSquarePlus, MoreVertical, Send, ShieldQuestion, Trash2, Users } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AdminChat from '../components/AdminChat'
import Avatar from '../components/Avatar'
import { GroupAvatar, GroupThreadView, NewGroupModal, groupSubtitle } from '../components/GroupChat'
import { ChessInvitesStrip } from '../components/chess/ChessInvites'
import SupportInbox from '../components/SupportInbox'
import { ConfirmModal, EmptyState, Modal, PageSpinner, Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { api, errorMessage } from '../lib/api'
import type { DirectoryUser, MessageThread } from '../lib/types'
import { usePageMeta } from '../lib/usePageMeta'
import { useGroups, useMessageThread, useMessageThreads, useStudentDirectory, directoryUsers } from '../lib/queries'
import { cn, formatShort, formatTime } from '../lib/utils'

const ADMIN_KEY = 'admin'
const GROUP_PREFIX = 'g:'

function ThreadView({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient()
  const { toast } = useUi()
  const [text, setText] = useState('')
  const [menu, setMenu] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
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
  const remove = useMutation({
    mutationFn: () => api(`/messages/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast('Conversation deleted')
      qc.invalidateQueries({ queryKey: ['messages'] })
      onBack()
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
      <header className="flex h-24 shrink-0 items-center gap-3 border-b border-ink-200 bg-white px-7 dark:border-ink-800 dark:bg-ink-900">
        <button className="grid size-11 place-items-center rounded-[10px] text-ink-500 hover:bg-ink-100 md:hidden dark:hover:bg-ink-800" onClick={onBack} aria-label="Back to conversations"><ArrowLeft className="size-5" /></button>
        {data?.conversation.peer && <Avatar user={data.conversation.peer} size="md" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{data?.conversation.peer?.name ?? 'Conversation'}</p>
          {data?.conversation.peer?.username && <p className="truncate text-xs text-ink-500">@{data.conversation.peer.username}</p>}
        </div>
        <div className="relative">
          <button className="grid size-11 place-items-center rounded-[10px] text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800" onClick={() => setMenu((m) => !m)} aria-label="Conversation options">
            <MoreVertical className="size-5" />
          </button>
          {menu && (
            <>
              <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setMenu(false)} tabIndex={-1} />
              <div className="card absolute right-0 z-20 mt-1 w-52 overflow-hidden p-1.5 text-sm shadow-lift">
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50"
                  onClick={() => { setMenu(false); setConfirmDelete(true) }}
                >
                  <Trash2 className="size-4" /> Delete conversation
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-ink-50 px-5 py-6 dark:bg-ink-950/40">
        {isLoading ? (
          <div className="grid h-full place-items-center"><Spinner /></div>
        ) : messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-ink-500">Say hello to start the conversation.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {messages.map((m) => (
              <div key={m._id} className={cn('flex max-w-[78%] flex-col gap-1', m.mine ? 'self-end items-end' : 'self-start items-start')}>
                <div className={cn('rounded-[16px] px-3.5 py-2.5 text-[14px] leading-[21px]', m.mine ? 'rounded-br-[4px] bg-brand text-white' : 'rounded-bl-[4px] bg-white text-ink-900 ring-1 ring-ink-200 dark:bg-ink-800 dark:text-ink-100 dark:ring-ink-700')}>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                </div>
                <p className="px-1 text-[10px] text-ink-400">{formatTime(m.createdAt)}</p>
              </div>
            ))}
            <div ref={end} />
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="flex shrink-0 items-center gap-2.5 border-t border-ink-200 bg-white p-6 dark:border-ink-800 dark:bg-ink-900">
        <input className="input flex-1" placeholder="Type a message…" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} aria-label="Message" />
        <button type="submit" className="btn-primary size-12 shrink-0 px-0" disabled={send.isPending || !text.trim()} aria-label="Send">
          {send.isPending ? <Spinner className="size-5" /> : <Send className="size-5" />}
        </button>
      </form>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
        busy={remove.isPending}
        title="Delete conversation"
        confirmLabel="Delete"
        message={<>Delete this conversation and all of its messages? This cannot be undone.</>}
      />
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
  const users = directoryUsers(data).filter((u): u is DirectoryUser & { _id: string } => Boolean(u._id))

  return (
    <Modal open={open} onClose={onClose} title="New message">
      <label className="sr-only" htmlFor="new-chat-search">Search students</label>
      <input id="new-chat-search" className="input" placeholder="Search by name or username…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="mt-4 max-h-80 overflow-y-auto">
        {isLoading ? (
          <div className="grid place-items-center py-8"><Spinner /></div>
        ) : users.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-500">No students found.</p>
        ) : (
          users.map((u) => (
            <button
              key={u._id}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-ink-100 disabled:opacity-50 dark:hover:bg-ink-800"
              disabled={start.isPending}
              onClick={() => start.mutate(u._id)}
            >
              <Avatar user={u} size="sm" />
              <div className="min-w-0">
                <p className="truncate font-medium">{u.name}</p>
                <p className="truncate text-xs text-ink-500">@{u.username}</p>
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
  const { data: directory, isLoading: dirLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useStudentDirectory(search, Boolean(user) && !isAdmin)

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
  // chat can be started straight from the sidebar. Students who have not signed
  // in yet are listed too, but marked as such and cannot be messaged.
  const list = useMemo(() => {
    const term = search.trim().toLowerCase()
    const conversations = (threads ?? []).filter((t) => {
      if (tab === 'unread' && t.unread === 0) return false
      if (!term) return true
      return t.peer?.name?.toLowerCase().includes(term) || t.peer?.username?.toLowerCase().includes(term) || t.lastMessage.toLowerCase().includes(term)
    })
    if (tab === 'unread') return conversations
    const seen = new Set(conversations.map((c) => c.peer?._id))
    const others = directoryUsers(directory).filter((u) => !u._id || !seen.has(u._id))
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
        <div className="card mx-5 my-5 flex min-h-0 flex-1 overflow-hidden md:mx-10 md:my-8 md:grid md:grid-cols-[320px_1fr]">
          <SupportInbox selected={selected} onSelect={setSelected} onBack={() => setSelected(null)} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="card mx-5 my-5 flex min-h-0 flex-1 overflow-hidden md:mx-10 md:my-8 md:grid md:grid-cols-[320px_1fr]">
        <div className={cn('flex min-h-0 flex-col bg-white md:border-r md:border-ink-200 dark:bg-ink-900 dark:md:border-ink-800', selected && 'hidden md:flex')}>
          <div className="flex flex-col gap-[18px] p-5">
            <h1 className="font-heading text-[28px] font-semibold leading-8 tracking-[-0.5px]">Messages</h1>
            <div className="flex gap-2">
              <button className="btn-primary flex-1" onClick={() => setPicker(true)}>
                <MessageSquarePlus className="size-4" /> New message
              </button>
              <button className="btn-outline flex-1" onClick={() => setGroupPicker(true)}>
                <Users className="size-4" /> New group
              </button>
            </div>
            <input className="input" placeholder="Search name or username" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search messages" />
            <div className="flex gap-2">
              {(['all', 'unread'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'flex-1 rounded-[10px] py-2.5 text-xs font-bold capitalize transition',
                    tab === t ? 'bg-brand text-white' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {!search.trim() && tab === 'all' && <ChessInvitesStrip />}
            {!search.trim() && tab === 'all' && (groupsLoading || (groups ?? []).length > 0) && (
              <div className="border-b border-ink-100 dark:border-ink-800">
                <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Groups</p>
                {(groups ?? []).map((g) => (
                  <button
                    key={g._id}
                    onClick={() => setSelected(GROUP_PREFIX + g._id)}
                    className={cn('flex w-full items-center gap-3 border-b border-ink-100 px-4 py-3 text-left hover:bg-ink-50 dark:border-ink-800 dark:hover:bg-ink-800/40', selected === GROUP_PREFIX + g._id && 'bg-brand-soft dark:bg-brand/15')}
                  >
                    <GroupAvatar group={g} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold">{g.name}</span>
                        <span className="shrink-0 text-[11px] text-ink-400">{formatShort(g.lastMessageAt)}</span>
                      </div>
                      <span className="block truncate text-sm text-ink-500">{g.lastMessage || groupSubtitle(g)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setSelected(ADMIN_KEY)}
              className={cn('flex w-full items-center gap-3 border-b border-ink-100 px-4 py-3 text-left hover:bg-ink-50 dark:border-ink-800 dark:hover:bg-ink-800/40', selected === ADMIN_KEY && 'bg-brand-soft dark:bg-brand/15')}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
                <ShieldQuestion className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <span className="truncate font-semibold">Support</span>
                <span className="block truncate text-sm text-ink-500">Chat with the admin team</span>
              </div>
            </button>
            {isLoading || dirLoading ? (
              <PageSpinner />
            ) : list.length === 0 && (search.trim() || tab === 'unread' || (groups ?? []).length === 0) ? (
              <div className="p-6 text-center text-sm text-ink-500">
                {search.trim() || tab === 'unread' ? 'Nothing matches that filter.' : (
                  <>
                    <p>No students yet.</p>
                    <button className="btn-outline mt-3" onClick={() => setPicker(true)}>Start one</button>
                  </>
                )}
              </div>
            ) : (
              <>
                {list.map((item, idx) => {
                  const isThread = 'peer' in item
                  if (isThread) {
                    const peer = item.peer
                    return (
                      <button
                        key={item._id}
                        onClick={() => setSelected(item._id)}
                        className={cn('flex w-full items-center gap-3 border-b border-ink-100 px-4 py-3 text-left hover:bg-ink-50 dark:border-ink-800 dark:hover:bg-ink-800/40', selected === item._id && 'bg-brand-soft dark:bg-brand/15')}
                      >
                        <Avatar user={peer} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-semibold">{peer.name ?? 'Student'}</span>
                            <span className="shrink-0 text-[11px] text-ink-400">{formatShort(item.lastMessageAt)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm text-ink-500">{item.lastMessage || 'No messages yet'}</span>
                            {item.unread > 0 && <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand text-[10px] font-bold text-white">{item.unread}</span>}
                          </div>
                        </div>
                      </button>
                    )
                  }
                  // A roster student with no account yet is listed but not messaged;
                  // one who has an account but has not signed in can still be messaged.
                  const canMessage = Boolean(item._id)
                  return (
                    <button
                      key={item._id ?? `roster-${idx}`}
                      onClick={() => canMessage && start.mutate(item._id as string)}
                      disabled={!canMessage || start.isPending}
                      className="flex w-full items-center gap-3 border-b border-ink-100 px-4 py-3 text-left hover:bg-ink-50 disabled:cursor-default disabled:hover:bg-transparent dark:border-ink-800 dark:hover:bg-ink-800/40 dark:disabled:hover:bg-transparent"
                    >
                      <Avatar user={item} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn('truncate font-semibold', !item.joined && 'text-ink-500')}>{item.name || 'Student'}</span>
                          {!item.joined && item._id && <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-500 dark:bg-ink-800 dark:text-ink-400">Not signed in yet</span>}
                        </div>
                        <span className="block truncate text-sm text-ink-500">{item._id ? (item.username ? `@${item.username}` : 'Start a chat') : 'No account yet'}</span>
                      </div>
                    </button>
                  )
                })}
                {hasNextPage && tab !== 'unread' && (
                  <div className="p-3">
                    <button className="btn-outline w-full" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                      {isFetchingNextPage ? <Spinner className="size-4" /> : 'Load more students'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          <p className="border-t border-ink-100 px-5 py-4 text-[11px] text-ink-400 dark:border-ink-800">
            Messages are kept for 30 days.
          </p>
        </div>
        <div className={cn('flex min-h-0 flex-col overflow-hidden bg-ink-50 dark:bg-ink-950/40', !selected && 'hidden md:block')}>
          {selected === ADMIN_KEY ? (
            <AdminChat onBack={() => setSelected(null)} />
          ) : selected?.startsWith(GROUP_PREFIX) ? (
            <GroupThreadView key={selected} id={selected.slice(GROUP_PREFIX.length)} onBack={() => setSelected(null)} />
          ) : selected ? (
            <ThreadView key={selected} id={selected} onBack={() => setSelected(null)} />
          ) : (
            <div className="grid h-full place-items-center p-8 text-center text-sm text-ink-500">
              <div>
                <MessageSquarePlus className="mx-auto mb-2 size-6 opacity-40" aria-hidden />
                Select a conversation, or start a new one.
              </div>
            </div>
          )}
          </div>
      </div>

      <NewChatPicker open={picker} onClose={() => setPicker(false)} onStarted={(id) => setSelected(id)} />
      <NewGroupModal open={groupPicker} onClose={() => setGroupPicker(false)} onCreated={(id) => setSelected(GROUP_PREFIX + id)} />
    </div>
  )
}
