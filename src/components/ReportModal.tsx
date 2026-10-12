import { useMutation } from '@tanstack/react-query'
import { Flag } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal, Spinner } from './ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { api, errorMessage } from '../lib/api'
import { REPORT_REASONS } from '../lib/reports'
import type { ReportKind } from '../lib/types'
import { cn } from '../lib/utils'

// A single flag button that opens the report dialog. It renders nothing for a
// guest (reporting needs an account) and for a signed-in user's own content.
export function ReportButton({
  kind,
  targetId,
  className,
  label = 'Report',
  preview,
}: {
  kind: ReportKind
  targetId: string
  className?: string
  label?: string
  preview?: string
}) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  if (!user) return null
  return (
    <>
      <button
        className={cn('btn-ghost px-3 py-1.5 text-ink-400 hover:text-amber-600', className)}
        onClick={() => setOpen(true)}
        aria-label={`${label} this ${kind}`}
      >
        <Flag className="size-5" />
        {label && <span className="hidden sm:inline">{label}</span>}
      </button>
      <ReportModal open={open} onClose={() => setOpen(false)} kind={kind} targetId={targetId} preview={preview} />
    </>
  )
}

export function ReportModal({
  open,
  onClose,
  kind,
  targetId,
  preview,
}: {
  open: boolean
  onClose: () => void
  kind: ReportKind
  targetId: string
  preview?: string
}) {
  const { user } = useAuth()
  const { toast } = useUi()
  const [reason, setReason] = useState<string>('spam')
  const [details, setDetails] = useState('')

  const submit = useMutation({
    mutationFn: () => api('/reports', { method: 'POST', body: { kind, targetId, reason, details: details.trim() } }),
    onSuccess: () => {
      toast('Thanks — an admin will review this report')
      setDetails('')
      setReason('spam')
      onClose()
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  })

  return (
    <Modal open={open} onClose={onClose} title="Report">
      {!user ? (
        <div className="space-y-4 text-sm text-ink-600 dark:text-ink-300">
          <p>Log in to report content. Reports help keep the community safe.</p>
          <Link to="/login" className="btn-primary w-full justify-center" onClick={onClose}>
            Log in
          </Link>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit.mutate()
          }}
        >
          {preview && (
            <p className="line-clamp-3 rounded-xl bg-ink-50 px-3 py-2 text-sm text-ink-500 dark:bg-ink-900">
              {preview}
            </p>
          )}
          <div>
            <p className="label">Why are you reporting this {kind}?</p>
            <div className="space-y-1.5">
              {REPORT_REASONS.map((r) => (
                <label
                  key={r.value}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition',
                    reason === r.value
                      ? 'border-brand bg-brand-soft text-brand dark:bg-brand/10'
                      : 'border-ink-200 hover:bg-ink-50 dark:border-ink-800 dark:hover:bg-ink-800/60',
                  )}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    className="accent-brand"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="report-details">Anything to add? (optional)</label>
            <textarea
              id="report-details"
              className="input min-h-20"
              maxLength={1000}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Add context for the admin…"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-danger" disabled={submit.isPending}>
              {submit.isPending ? <Spinner className="size-4" /> : <Flag className="size-4" />} Submit report
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
