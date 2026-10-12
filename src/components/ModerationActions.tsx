import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock, ShieldOff } from 'lucide-react'
import { useState } from 'react'
import { Modal, Spinner } from './ui'
import { useUi } from '../context/UiContext'
import { api, errorMessage } from '../lib/api'

// Suspend or disable an account from anywhere in the admin area. The report queue
// and the thoughts list both mount this so an admin can act on the offender (or
// author) inline, without first finding them in User management.
const DURATIONS = [
  { label: '1 hour', hours: 1 },
  { label: '24 hours', hours: 24 },
  { label: '7 days', hours: 24 * 7 },
  { label: '30 days', hours: 24 * 30 },
] as const

export function ModerationActions({
  userId,
  username,
  status,
  className,
}: {
  userId: string
  username: string
  status?: string
  className?: string
}) {
  const qc = useQueryClient()
  const { toast } = useUi()
  const [open, setOpen] = useState(false)
  const [hours, setHours] = useState<number>(24)
  const disabled = status === 'disabled'

  const act = useMutation({
    mutationFn: ({ action, suspendUntil }: { action: 'suspend' | 'dismiss' | 'reinstate'; suspendUntil?: string }) =>
      api(`/admin/users/${userId}`, { method: 'PATCH', body: { action, suspendUntil } }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['admin'] })
      toast(vars.action === 'suspend' ? 'User suspended' : vars.action === 'dismiss' ? 'User disabled' : 'User reinstated')
      setOpen(false)
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  })

  return (
    <>
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 dark:hover:bg-ink-800 dark:hover:text-white ${className ?? ''}`}
        onClick={() => setOpen(true)}
        aria-label={`Moderate @${username}`}
      >
        <ShieldOff className="size-3.5" /> Moderate
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={`Moderate @${username}`}>
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
            <p className="mt-2 text-xs text-ink-500">The account is blocked now and lifts automatically when the time is up.</p>
          </div>

          <div className="border-t border-ink-200 pt-4 dark:border-ink-800">
            <button type="button" className="btn-danger w-full justify-center" disabled={act.isPending} onClick={() => act.mutate({ action: 'dismiss' })}>
              <ShieldOff className="size-4" /> Disable until I re-enable
            </button>
          </div>

          {disabled && (
            <button type="button" className="btn-outline w-full justify-center" disabled={act.isPending} onClick={() => act.mutate({ action: 'reinstate' })}>
              Reinstate account
            </button>
          )}
        </div>
      </Modal>
    </>
  )
}
