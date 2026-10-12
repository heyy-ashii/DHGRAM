import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Search, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ModerationActions } from '../../components/ModerationActions'
import { EmptyState, Modal, PageSpinner, Spinner } from '../../components/ui'
import { useUi } from '../../context/UiContext'
import { api, errorMessage } from '../../lib/api'
import { useAdminThoughts } from '../../lib/queries'
import type { Post } from '../../lib/types'
import { usePageMeta } from '../../lib/usePageMeta'
import { cn, formatShort } from '../../lib/utils'

export default function Thoughts() {
  usePageMeta('Thoughts · Admin')
  const qc = useQueryClient()
  const { toast } = useUi()
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [hidden, setHidden] = useState('')
  const [page, setPage] = useState(1)
  const [deleting, setDeleting] = useState<Post | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  const { data, isLoading, isFetching } = useAdminThoughts({ q: search, hidden: hidden || undefined, page, limit: 20 })

  const setVisibility = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) => api(`/posts/${id}`, { method: 'PATCH', body: { hidden: value } }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['admin'] })
      toast(vars.value ? 'Thought hidden' : 'Thought unhidden')
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api(`/posts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin'] })
      toast('Thought deleted')
      setDeleting(null)
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  })

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Thoughts</h1>
          <p className="text-sm text-ink-500">{data ? `${data.total} thought${data.total === 1 ? '' : 's'}` : ' '}</p>
        </div>
        <select className="input w-auto" value={hidden} onChange={(e) => { setHidden(e.target.value); setPage(1) }} aria-label="Filter visibility">
          <option value="">All thoughts</option>
          <option value="false">Visible</option>
          <option value="true">Hidden</option>
        </select>
      </div>

      <div className="relative mt-6 max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
        <input className="input pl-9" placeholder="Search text, author name or username" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search thoughts" />
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : data && data.data.posts.length === 0 ? (
        <EmptyState title="No thoughts found" description="Nothing matches your search yet." />
      ) : (
        <div className={cn('mt-4 space-y-3', isFetching && 'opacity-70')}>
          {data?.data.posts.map((p) => (
            <article key={p._id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap break-words text-sm text-ink-800 dark:text-ink-100">{p.body}</p>
                  <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-ink-400">
                    <Link className="font-medium text-ink-600 hover:underline dark:text-ink-300" to={`/u/${p.author.username}`}>
                      {p.author.name || `@${p.author.username}`}
                    </Link>
                    · @{p.author.username} · {formatShort(p.createdAt)} · {p.likes} like{p.likes === 1 ? '' : 's'}
                    {p.hidden && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-600">hidden</span>}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                  <ModerationActions userId={p.author._id} username={p.author.username} />
                  <button
                    type="button"
                    className="btn-ghost px-3 py-1.5 text-sm"
                    disabled={setVisibility.isPending}
                    onClick={() => setVisibility.mutate({ id: p._id, value: !p.hidden })}
                  >
                    {p.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />} {p.hidden ? 'Unhide' : 'Hide'}
                  </button>
                  <button
                    type="button"
                    className="btn-danger px-3 py-1.5 text-sm"
                    onClick={() => setDeleting(p)}
                  >
                    <Trash2 className="size-4" /> Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {data && data.pages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <button className="btn-outline px-3 py-1.5" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span>Page {data.page} of {data.pages}</span>
          <button className="btn-outline px-3 py-1.5" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete thought?">
        <p className="whitespace-pre-wrap break-words rounded-xl bg-ink-50 p-3 text-sm text-ink-600 dark:bg-ink-900 dark:text-ink-300">
          {deleting?.body}
        </p>
        <p className="mt-3 text-sm text-ink-500">This permanently removes the thought. It cannot be undone.</p>
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setDeleting(null)}>Cancel</button>
          <button className="btn-danger" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting._id)}>
            {remove.isPending && <Spinner className="size-4" />} Delete
          </button>
        </div>
      </Modal>
    </div>
  )
}
