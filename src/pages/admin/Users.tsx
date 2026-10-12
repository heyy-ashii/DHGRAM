import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, KeyRound, Pencil, Plus, Search, ShieldOff, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Modal, PageSpinner, Spinner, StatusBadge } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useUi } from '../../context/UiContext'
import { api, errorMessage } from '../../lib/api'
import type { User } from '../../lib/types'
import { usePageMeta } from '../../lib/usePageMeta'
import { formatDate } from '../../lib/utils'

type UserList = { total: number; page: number; pages: number; data: { users: User[] } }
type Draft = { name: string; username: string; email: string; password: string; role: User['role']; status: User['status'] }
const emptyDraft: Draft = { name: '', username: '', email: '', password: '', role: 'user', status: 'active' }

const DURATIONS = [
  { label: '1 hour', hours: 1 },
  { label: '24 hours', hours: 24 },
  { label: '7 days', hours: 24 * 7 },
  { label: '30 days', hours: 24 * 30 },
] as const

const suspensionBadge = (u: User) => {
  if (u.suspension === 'suspended' && u.suspendedUntil) {
    const ended = new Date(u.suspendedUntil).getTime() <= Date.now()
    if (!ended) return `Suspended until ${new Date(u.suspendedUntil).toLocaleString()}`
    return 'Suspension ended'
  }
  if (u.suspension === 'dismissed') return 'Dismissed'
  return null
}

function SuspendModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useUi()
  const [hours, setHours] = useState<number>(24)

  const act = useMutation({
    mutationFn: ({ action, suspendUntil }: { action: 'suspend' | 'dismiss' | 'reinstate'; suspendUntil?: string }) =>
      api(`/admin/users/${user?._id}`, { method: 'PATCH', body: { action, suspendUntil } }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['admin'] })
      toast(vars.action === 'suspend' ? 'User suspended' : vars.action === 'dismiss' ? 'User dismissed' : 'User reinstated')
      onClose()
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  })

  if (!user) return null
  return (
    <Modal open onClose={onClose} title={`Moderate @${user.username}`}>
      <div className="space-y-4">
        <div>
          <p className="label">Suspend for a set time</p>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d.hours}
                type="button"
                className={hours === d.hours ? 'btn-primary px-3 py-1.5 text-sm' : 'btn-outline px-3 py-1.5 text-sm'}
                onClick={() => setHours(d.hours)}
              >
                {d.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn-primary mt-3 w-full justify-center"
            disabled={act.isPending}
            onClick={() => act.mutate({ action: 'suspend', suspendUntil: new Date(Date.now() + hours * 3600_000).toISOString() })}
          >
            {act.isPending ? <Spinner className="size-4" /> : <Clock className="size-4" />} Suspend for {DURATIONS.find((d) => d.hours === hours)?.label}
          </button>
          <p className="mt-2 text-xs text-ink-500">Their account is blocked now and lifts automatically when the time is up.</p>
        </div>

        <div className="border-t border-ink-200 pt-4 dark:border-ink-800">
          <button
            type="button"
            className="btn-danger w-full justify-center"
            disabled={act.isPending}
            onClick={() => act.mutate({ action: 'dismiss' })}
          >
            <ShieldOff className="size-4" /> Disable until I re-enable
          </button>
        </div>

        {user.status === 'disabled' && (
          <button
            type="button"
            className="btn-outline w-full justify-center"
            disabled={act.isPending}
            onClick={() => act.mutate({ action: 'reinstate' })}
          >
            Reinstate account
          </button>
        )}
      </div>
    </Modal>
  )
}

function UserForm({ initial, onClose }: { initial: User | null; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useUi()
  const [draft, setDraft] = useState<Draft>(
    initial ? { name: initial.name, username: initial.username, email: initial.email ?? '', password: '', role: initial.role, status: initial.status } : emptyDraft,
  )
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const save = useMutation({
    mutationFn: () => {
      const body: Partial<Draft> = { ...draft }
      if (initial && !body.password) delete body.password
      return initial ? api(`/admin/users/${initial._id}`, { method: 'PATCH', body }) : api('/admin/users', { method: 'POST', body })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin'] })
      toast(initial ? 'User updated' : 'User created')
      onClose()
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  })
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate()
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="u-name">Name</label>
          <input id="u-name" className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="u-username">Username</label>
          <input id="u-username" className="input" value={draft.username} pattern="[a-z0-9._]{3,30}" onChange={(e) => set('username', e.target.value.toLowerCase())} required />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="u-email">Email (optional)</label>
        <input id="u-email" type="email" className="input" value={draft.email} onChange={(e) => set('email', e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="u-password">{initial ? 'Set new password' : 'Password'}</label>
        <input
          id="u-password"
          type="text"
          className="input font-mono"
          value={draft.password}
          minLength={8}
          placeholder={initial ? 'Leave blank to keep current password' : 'At least 8 characters'}
          onChange={(e) => set('password', e.target.value)}
          required={!initial}
          autoComplete="new-password"
        />
        <p className="mt-1 text-xs text-ink-500">Passwords are stored encrypted (bcrypt) and can only be reset, never viewed.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="u-role">Role</label>
          <select id="u-role" className="input" value={draft.role} onChange={(e) => set('role', e.target.value as Draft['role'])}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="u-status">Status</label>
          <select id="u-status" className="input" value={draft.status} onChange={(e) => set('status', e.target.value as Draft['status'])}>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending && <Spinner className="size-4" />} {initial ? 'Save changes' : 'Create user'}</button>
      </div>
    </form>
  )
}

export default function Users() {
  usePageMeta('Users · Admin')
  const qc = useQueryClient()
  const { toast } = useUi()
  const { user: me } = useAuth()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const role = params.get('role') || ''
  const status = params.get('status') || ''
  const [editing, setEditing] = useState<User | null | undefined>(params.get('new') ? null : undefined)
  const [deleting, setDeleting] = useState<User | null>(null)
  const [moderating, setModerating] = useState<User | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin', 'users', { search, role, status, page }],
    queryFn: () => api<UserList>('/admin/users', { query: { q: search, role, status, page, limit: 20 } }),
    placeholderData: keepPreviousData,
  })

  const quickUpdate = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<User> }) => api(`/admin/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin'] })
      toast('User updated')
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin'] })
      toast('User deleted')
      setDeleting(null)
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  })

  const setFilter = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    next.delete('new')
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
    setPage(1)
  }

  const closeForm = () => {
    setEditing(undefined)
    if (params.get('new')) setFilter('new', '')
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">User management</h1>
          <p className="text-sm text-ink-500">{data ? `${data.total} account${data.total === 1 ? '' : 's'}` : ' '}</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing(null)}><Plus className="size-4" /> Add user</button>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <input className="input pl-9" placeholder="Search name, username or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
        </div>
        <select className="input w-auto" value={role} onChange={(e) => setFilter('role', e.target.value)} aria-label="Filter role">
          <option value="">All roles</option>
          <option value="user">Users</option>
          <option value="admin">Admins</option>
        </select>
        <select className="input w-auto" value={status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Filter status">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : (
        <div className={`card mt-4 overflow-x-auto ${isFetching ? 'opacity-70' : ''}`}>
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:bg-ink-900">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Password</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
              {data?.data.users.map((u) => {
                const isMe = u._id === me?._id
                return (
                  <tr key={u._id} className="hover:bg-ink-50 dark:hover:bg-ink-800/40">
                    <td className="px-4 py-3 font-medium">{u.name}{isMe && <span className="ml-2 text-xs text-ink-400">(you)</span>}</td>
                    <td className="px-4 py-3 font-mono text-xs">@{u.username}</td>
                    <td className="px-4 py-3">{u.email ?? <span className="text-ink-400">—</span>}{u.email && u.emailVerified && <span className="ml-1 text-xs text-emerald-600">✓</span>}</td>
                    <td className="px-4 py-3">
                      <select
                        className="rounded-lg border border-ink-200 bg-transparent px-2 py-1 text-xs dark:border-ink-700"
                        value={u.role}
                        disabled={isMe}
                        onChange={(e) => quickUpdate.mutate({ id: u._id, body: { role: e.target.value as User['role'] } })}
                        aria-label={`Role for ${u.username}`}
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        disabled={isMe}
                        onClick={() => setModerating(u)}
                        title={isMe ? 'You cannot moderate yourself' : 'Suspend or disable this account'}
                        className="text-left disabled:cursor-not-allowed"
                      >
                        <StatusBadge status={u.status} />
                        {suspensionBadge(u) && (
                          <span className="mt-0.5 block text-xs text-amber-600">
                            {u.suspension === 'suspended' ? `until ${new Date(u.suspendedUntil!).toLocaleDateString()}` : 'dismissed'}
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline" onClick={() => setEditing(u)}>
                        <KeyRound className="size-3.5" /> Reset
                      </button>
                    </td>
                    <td className="px-4 py-3 text-ink-500">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button className="btn-ghost p-2" onClick={() => setModerating(u)} disabled={isMe} title="Suspend or disable" aria-label={`Moderate ${u.username}`}><ShieldOff className="size-4" /></button>
                        <button className="btn-ghost p-2" onClick={() => setEditing(u)} aria-label={`Edit ${u.username}`}><Pencil className="size-4" /></button>
                        <button className="btn-ghost p-2 text-red-600 hover:text-red-700" disabled={isMe} onClick={() => setDeleting(u)} aria-label={`Delete ${u.username}`}><Trash2 className="size-4" /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {data?.data.users.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-ink-500">No users match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {data && data.pages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <button className="btn-outline px-3 py-1.5" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span>Page {data.page} of {data.pages}</span>
          <button className="btn-outline px-3 py-1.5" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}

      <Modal open={editing !== undefined} onClose={closeForm} title={editing ? `Edit @${editing.username}` : 'Add user'}>
        {editing !== undefined && <UserForm key={editing?._id ?? 'new'} initial={editing} onClose={closeForm} />}
      </Modal>

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete user?">
        <p className="text-sm text-ink-600 dark:text-ink-400">
          This permanently deletes <strong>@{deleting?.username}</strong> along with their thoughts, stories and chats. This cannot be undone.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setDeleting(null)}>Cancel</button>
          <button className="btn-danger" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting._id)}>
            {remove.isPending && <Spinner className="size-4" />} Delete
          </button>
        </div>
      </Modal>

      <SuspendModal user={moderating} onClose={() => setModerating(null)} />
    </div>
  )
}
