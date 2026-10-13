import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Trash2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, PageSpinner, Spinner } from '../../components/ui'
import { ModerationActions } from '../../components/ModerationActions'
import { useUi } from '../../context/UiContext'
import { api, errorMessage } from '../../lib/api'
import { useReports } from '../../lib/queries'
import { REPORT_KINDS, reportReasonLabel } from '../../lib/reports'
import type { Report } from '../../lib/types'
import { usePageMeta } from '../../lib/usePageMeta'
import { cn, formatShort } from '../../lib/utils'

const STATUSES = ['open', 'resolved', 'dismissed', 'all'] as const
const KINDS = REPORT_KINDS

const kindStyles: Record<Report['kind'], string> = {
  post: 'bg-brand/10 text-brand',
  story: 'bg-fuchsia-500/10 text-fuchsia-600',
  user: 'bg-amber-500/10 text-amber-600',
}

export default function Reports() {
  usePageMeta('Reports · Admin')
  const qc = useQueryClient()
  const { toast } = useUi()
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('open')
  const [kind, setKind] = useState<string>('')
  const [page, setPage] = useState(1)

  const { data, isLoading, isFetching } = useReports({ status, kind: kind || undefined, page, limit: 20 })

  const resolve = useMutation({
    mutationFn: ({ id, action, removeContent }: { id: string; action: 'resolve' | 'dismiss'; removeContent?: boolean }) =>
      api(`/admin/reports/${id}`, { method: 'PATCH', body: { action, removeContent } }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['admin'] })
      toast(vars.action === 'dismiss' ? 'Report dismissed' : 'Report resolved')
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  })

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-ink-500">{data ? `${data.total} report${data.total === 1 ? '' : 's'}` : ' '}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1) }} aria-label="Filter status">
            {STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
          <select className="input w-auto" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1) }} aria-label="Filter kind">
            <option value="">All kinds</option>
            {KINDS.map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}s</option>)}
          </select>
        </div>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : data && data.data.reports.length === 0 ? (
        <EmptyState title="Nothing to review" description="When students report thoughts, stories or accounts they show up here." />
      ) : (
        <div className={cn('mt-4 space-y-3', isFetching && 'opacity-70')}>
          {data?.data.reports.map((r) => (
            <article key={r._id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold capitalize', kindStyles[r.kind])}>{r.kind}</span>
                    <span className="text-sm font-semibold">{reportReasonLabel(r.reason)}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                      r.status === 'open' ? 'bg-amber-500/10 text-amber-600' : r.status === 'resolved' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-ink-500/10 text-ink-500')}>
                      {r.status}
                    </span>
                  </div>
                  {r.targetLabel && <p className="mt-2 line-clamp-2 text-sm text-ink-600 dark:text-ink-300">{r.targetLabel}</p>}
                  {r.details && <p className="mt-1 text-sm text-ink-500">“{r.details}”</p>}
                  <p className="mt-2 text-xs text-ink-400">
                    Reported by {r.reporterName || 'a student'} · {formatShort(r.createdAt)}
                    {r.handledAt && <> · handled {formatShort(r.handledAt)}</>}
                  </p>
                  {r.targetAuthor && (
                    <div className="mt-2 flex items-center gap-3">
                      <span className="text-xs text-ink-500">
                        Author: <span className="font-medium text-ink-700 dark:text-ink-200">{r.targetAuthor.name || `@${r.targetAuthor.username}`}</span>
                      </span>
                      <ModerationActions userId={r.targetAuthor._id} username={r.targetAuthor.username} />
                    </div>
                  )}
                </div>

                {r.status === 'open' && (
                  <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
                    {r.kind !== 'user' && (
                      <button
                        className="btn-danger flex-1 px-3 py-1.5 text-sm sm:flex-none"
                        disabled={resolve.isPending}
                        onClick={() => resolve.mutate({ id: r._id, action: 'resolve', removeContent: true })}
                      >
                        {resolve.isPending ? <Spinner className="size-4" /> : <Trash2 className="size-4" />} Remove content
                      </button>
                    )}
                    <button className="btn-outline flex-1 px-3 py-1.5 text-sm sm:flex-none" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: r._id, action: 'resolve' })}>
                      <CheckCircle2 className="size-4" /> Resolve
                    </button>
                    <button className="btn-ghost flex-1 px-3 py-1.5 text-sm sm:flex-none" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: r._id, action: 'dismiss' })}>
                      <XCircle className="size-4" /> Dismiss
                    </button>
                  </div>
                )}
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
    </div>
  )
}
