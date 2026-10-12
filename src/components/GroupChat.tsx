import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, LogOut, MoreVertical, Search, Send, Trash2, UserMinus, UserPlus, Users, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Avatar from './Avatar'
import { ConfirmModal, Modal, Spinner } from './ui'
import { useUi } from '../context/UiContext'
import { api, errorMessage } from '../lib/api'
import type { GroupSummary, PeerUser } from '../lib/types'
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
          className={cn('absolute overflow-hidden rounded-full ring-2 ring-white dark:ring-slate-950')}
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

// The member roster and creator controls: add students, remove members, leave, or
// (for the creator) delete the group outright.
function GroupMembersModal({ open, onClose, group, onLeft, onDeleted }: {
  open: boolean
  onClose: () => void
  group: GroupSummary
  onLeft: () => void
  onDeleted: () => void
}) {
  const qc = useQueryClient()
  const { toast } = useUi()
  const { user } = useAuth()
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { data } = useStudentDirectory(q, open && adding)
  const isCreator = String(group.createdBy) === String(user?._id)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['groups'] })
  const candidates = useMemo(
    () => (data?.data.users ?? []).filter((u) => !group.members.some((m) => m._id === u._id)),
    [data, group.members],
  )

  const add = useMutation({
    mutationFn: (id: string) => api(`/groups/${group._id}/members`, { method: 'POST', body: { memberIds: [id] } }),
    onSuccess: () => { toast('Member added'); invalidate() },
    onError: (err) => toast(errorMessage(err), 'error'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api(`/groups/${group._id}/members/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast('Member removed'); invalidate() },
    onError: (err) => toast(errorMessage(err), 'error'),
  })

  const leave = useMutation({
    mutationFn: () => api(`/groups/${group._id}/members/me`, { method: 'DELETE' }),
    onSuccess: () => { toast('You left the group'); invalidate(); onClose(); onLeft() },
    onError: (err) => toast(errorMessage(err), 'error'),
  })

  const destroy = useMutation({
    mutationFn: () => api(`/groups/${group._id}`, { method: 'DELETE' }),
    onSuccess: () => { toast('Group deleted'); invalidate(); onClose(); onDeleted() },
    onError: (err) => toast(errorMessage(err), 'error'),
  })

  return (
    <>
      <Modal open={open} onClose={onClose} title={group.name}>
        <div className="space-y-4">
          <p className="text-sm text-slate-500">{groupSubtitle(group)}</p>

          {!adding ? (
            <button className="btn-outline w-full" onClick={() => setAdding(true)}>
              <UserPlus className="size-4" /> Add members
            </button>
          ) : (
            <div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="input pl-9"
                  placeholder="Search students to add…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  autoFocus
                  aria-label="Search students"
                />
              </div>
              <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
                {candidates.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-500">No students found.</p>
                ) : (
                  candidates.map((u) => (
                    <button
                      key={u._id}
                      type="button"
                      disabled={add.isPending}
                      onClick={() => add.mutate(u._id)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
                    >
                      <Avatar user={u} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{u.name}</p>
                        <p className="truncate text-xs text-slate-500">@{u.username}</p>
                      </div>
                      <UserPlus className="size-4 text-brand" />
                    </button>
                  ))
                )}
              </div>
              <button className="btn-ghost mt-2" onClick={() => setAdding(false)}>Done adding</button>
            </div>
          )}

          <div>
            <p className="label mb-2">Members</p>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {group.members.map((m) => (
                <div key={m._id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <Avatar user={m} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.name || 'Student'}</p>
                    <p className="truncate text-xs text-slate-500">@{m.username}</p>
                  </div>
                  {String(m._id) === String(group.createdBy) && (
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">Creator</span>
                  )}
                  {isCreator && String(m._id) !== String(user?._id) && (
                    <button
                      className="btn-ghost p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                      onClick={() => remove.mutate(m._id)}
                      disabled={remove.isPending}
                      aria-label={`Remove ${m.name || 'member'}`}
                    >
                      <UserMinus className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button className="btn-ghost text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50" onClick={() => setConfirmLeave(true)}>
              <LogOut className="size-4" /> Leave group
            </button>
            {isCreator && (
              <button className="btn-danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" /> Delete group
              </button>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        onConfirm={() => leave.mutate()}
        busy={leave.isPending}
        title="Leave group"
        confirmLabel="Leave"
        message={<>Leave <b>{group.name}</b>? You will stop receiving its messages.</>}
      />
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => destroy.mutate()}
        busy={destroy.isPending}
        title="Delete group"
        confirmLabel="Delete group"
        message={<>Delete <b>{group.name}</b> for everyone? This removes the group and all of its messages and cannot be undone.</>}
      />
    </>
  )
}

export function GroupThreadView({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient()
  const { toast } = useUi()
  const [text, setText] = useState('')
  const [members, setMembers] = useState(false)
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
      <header className="flex items-center gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
        <button className="btn-ghost p-2 md:hidden" onClick={onBack} aria-label="Back to conversations"><ArrowLeft className="size-4" /></button>
        {data?.group && <GroupAvatar group={data.group} size="sm" />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{data?.group.name ?? 'Group'}</p>
          {data?.group && <p className="truncate text-xs text-slate-500">{groupSubtitle(data.group)}</p>}
        </div>
        {data?.group && (
          <button className="btn-ghost p-2" onClick={() => setMembers(true)} aria-label="Group members and options">
            <MoreVertical className="size-4" />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto bg-slate-50 p-4 dark:bg-slate-900/40">
        {isLoading ? (
          <div className="grid h-full place-items-center"><Spinner /></div>
        ) : messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-slate-500">No messages yet. Say hello to the group.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((m) => (
              <div key={m._id} className={cn('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm', m.mine ? 'self-end rounded-br-sm bg-brand text-white' : 'self-start rounded-bl-sm bg-white shadow-sm dark:bg-slate-800')}>
                {!m.mine && <p className="mb-0.5 text-xs font-semibold text-brand">{nameOf(m.sender)}</p>}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={cn('mt-1 text-[10px]', m.mine ? 'text-indigo-100' : 'text-slate-400')}>{formatTime(m.createdAt)}</p>
              </div>
            ))}
            <div ref={end} />
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-800">
        <input className="input" placeholder="Message the group…" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} aria-label="Message group" />
        <button type="submit" className="btn-primary px-3" disabled={send.isPending || !text.trim()} aria-label="Send">
          {send.isPending ? <Spinner className="size-4" /> : <Send className="size-4" />}
        </button>
      </form>

      {members && data?.group && (
        <GroupMembersModal open={members} onClose={() => setMembers(false)} group={data.group} onLeft={onBack} onDeleted={onBack} />
      )}
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
            <span className="text-xs text-slate-500">{selected.size} selected</span>
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
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search students to add…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search students"
            />
          </div>
          <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
            {isLoading ? (
              <div className="grid place-items-center py-8"><Spinner /></div>
            ) : candidates.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">No students found.</p>
            ) : (
              candidates.map((u: PeerUser) => {
                const on = selected.has(u._id)
                return (
                  <button
                    key={u._id}
                    type="button"
                    onClick={() => toggle(u._id)}
                    className={cn('flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800', on && 'bg-brand/5')}
                  >
                    <Avatar user={u} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{u.name}</p>
                      <p className="truncate text-xs text-slate-500">@{u.username}</p>
                    </div>
                    <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border', on ? 'border-brand bg-brand text-white' : 'border-slate-300 dark:border-slate-600')}>
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
