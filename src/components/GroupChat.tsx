import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, Search, Send, Users, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Avatar from './Avatar'
import { Modal, Spinner } from './ui'
import { useUi } from '../context/UiContext'
import { api, errorMessage } from '../lib/api'
import type { GroupSummary } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { useGroup, useStudentDirectory } from '../lib/queries'
import { cn, formatTime } from '../lib/utils'

// A group avatar: a stack of up to three member faces, falling back to a Users
// glyph when the group has no members to draw.
export function GroupAvatar({ group, size = 'md' }: { group: Pick<GroupSummary, 'members'>; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'size-9' : 'size-11'
  const faces = (group.members ?? []).slice(0, size === 'sm' ? 2 : 3)
  if (faces.length === 0) {
    return (
      <span className={cn('grid shrink-0 place-items-center rounded-full bg-brand/10 text-brand', box)}>
        <Users className={size === 'sm' ? 'size-4' : 'size-5'} />
      </span>
    )
  }
  return (
    <span className={cn('relative shrink-0', box)}>
      {faces.map((m, i) => (
        <span
          key={m._id}
          className={cn('absolute overflow-hidden rounded-full ring-2 ring-white dark:ring-neutral-950')}
          style={{ left: `${i * 28}%`, top: `${i % 2 ? 22 : 0}%`, width: size === 'sm' ? '62%' : '60%', height: size === 'sm' ? '62%' : '60%' }}
        >
          <Avatar user={m} size="sm" className="size-full" />
        </span>
      ))}
    </span>
  )
}

export function groupSubtitle(group: Pick<GroupSummary, 'members'> & { memberCount?: number }) {
  const names = (group.members ?? []).map((m) => m.name).filter(Boolean)
  const count = group.memberCount ?? names.length
  if (names.length === 0) return `${count} ${count === 1 ? 'member' : 'members'}`
  const shown = names.slice(0, 3).join(', ')
  return names.length > 3 ? `${count} members · ${shown}…` : `${count} members · ${shown}`
}

export function GroupThreadView({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient()
  const { toast } = useUi()
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const { data, isLoading } = useGroup(id)
  const send = useMutation({
    mutationFn: (body: string) => api(`/groups/${id}/messages`, { method: 'POST', body: { body } }),
    onSuccess: () => {
      setText('')
      qc.invalidateQueries({ queryKey: ['groups'] })
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

  const nameOf = (senderId: string) => data?.group.members.find((m) => m._id === senderId)?.name ?? 'Member'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-neutral-200 p-4 dark:border-neutral-800">
        <button className="btn-ghost p-2 md:hidden" onClick={onBack} aria-label="Back to conversations"><ArrowLeft className="size-4" /></button>
        {data?.group && <GroupAvatar group={data.group} size="sm" />}
        <div className="min-w-0">
          <p className="truncate font-semibold">{data?.group.name ?? 'Group'}</p>
          {data?.group && <p className="truncate text-xs text-neutral-500">{groupSubtitle(data.group)}</p>}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-neutral-50 p-4 dark:bg-neutral-900/40">
        {isLoading ? (
          <div className="grid h-full place-items-center"><Spinner /></div>
        ) : messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-neutral-500">No messages yet. Say hello to the group.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((m) => (
              <div key={m._id} className={cn('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm', m.mine ? 'self-end rounded-br-sm bg-brand text-white' : 'self-start rounded-bl-sm bg-white shadow-sm dark:bg-neutral-800')}>
                {!m.mine && <p className="mb-0.5 text-xs font-semibold text-brand">{nameOf(m.sender)}</p>}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={cn('mt-1 text-[10px]', m.mine ? 'text-blue-100' : 'text-neutral-400')}>{formatTime(m.createdAt)}</p>
              </div>
            ))}
            <div ref={end} />
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2 border-t border-neutral-200 p-3 dark:border-neutral-800">
        <input className="input" placeholder="Message the group…" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} aria-label="Message group" />
        <button type="submit" className="btn-primary px-3" disabled={send.isPending || !text.trim()} aria-label="Send">
          {send.isPending ? <Spinner className="size-4" /> : <Send className="size-4" />}
        </button>
      </form>
    </div>
  )
}

export function NewGroupModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient()
  const { toast } = useUi()
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const { data, isLoading } = useStudentDirectory(q, open)

  const candidates = useMemo(
    () => (data?.data.users ?? []).filter((u) => u._id !== user?._id),
    [data, user?._id],
  )

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const create = useMutation({
    mutationFn: () =>
      api<{ data: { group: GroupSummary } }>('/groups', {
        method: 'POST',
        body: { name: name.trim(), memberIds: [...selected] },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      onClose()
      onCreated(res.data.group._id)
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  })

  const canSubmit = name.trim().length > 0 && selected.size > 0 && !create.isPending

  return (
    <Modal open={open} onClose={onClose} title="New group">
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="group-name">Group name</label>
          <input
            id="group-name"
            className="input"
            placeholder="e.g. Study buddies"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="label mb-0">Members</span>
            <span className="text-xs text-neutral-500">{selected.size} selected</span>
          </div>
          {selected.size > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {[...selected].map((id) => {
                const u = candidates.find((c) => c._id === id)
                return (
                  <span key={id} className="flex items-center gap-1 rounded-full bg-brand/10 py-1 pl-1 pr-2 text-xs font-medium text-brand">
                    <Avatar user={u ?? {}} size="sm" className="size-5" />
                    {u?.name ?? 'Member'}
                    <button onClick={() => toggle(id)} aria-label={`Remove ${u?.name ?? 'member'}`}><X className="size-3" /></button>
                  </span>
                )
              })}
            </div>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
            <input
              className="input pl-9"
              placeholder="Search students to add…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search students"
            />
          </div>
          <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
            {isLoading ? (
              <div className="grid place-items-center py-8"><Spinner /></div>
            ) : candidates.length === 0 ? (
              <p className="py-6 text-center text-sm text-neutral-500">No students found.</p>
            ) : (
              candidates.map((u) => {
                const on = selected.has(u._id)
                return (
                  <button
                    key={u._id}
                    type="button"
                    onClick={() => toggle(u._id)}
                    className={cn('flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800', on && 'bg-brand/5')}
                  >
                    <Avatar user={u} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{u.name}</p>
                      <p className="truncate text-xs text-neutral-500">@{u.username}</p>
                    </div>
                    <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border', on ? 'border-brand bg-brand text-white' : 'border-neutral-300 dark:border-neutral-600')}>
                      {on && <Check className="size-3" />}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => create.mutate()} disabled={!canSubmit}>
            {create.isPending ? <Spinner className="size-4" /> : <Users className="size-4" />} Create group
          </button>
        </div>
      </div>
    </Modal>
  )
}
