import { AlertCircle, CheckCircle2, Loader2, Sparkles, X, type LucideIcon } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useUi } from '../context/UiContext'
import { cn } from '../lib/utils'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin', className)} aria-hidden />
}

export function PageSpinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading">
      <Spinner className="size-8 text-brand" />
    </div>
  )
}

/* A shimmering placeholder used while a list is loading. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-2xl bg-ink-100 dark:bg-ink-800/70', className)} aria-hidden />
}

export function PostSkeleton() {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  )
}

export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <PostSkeleton key={i} />
      ))}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card mx-auto max-w-md p-8 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400">
        <AlertCircle className="size-6" />
      </span>
      <p className="mt-4 font-semibold">Something went wrong</p>
      <p className="mt-1 text-sm text-ink-500">{message}</p>
      {onRetry && (
        <button className="btn-outline mt-5" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  icon: Icon = Sparkles,
  children,
}: {
  title: string
  description?: string
  icon?: LucideIcon
  children?: ReactNode
}) {
  return (
    <div className="card mx-auto max-w-md p-10 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand dark:bg-brand/10">
        <Icon className="size-7" />
      </span>
      <p className="mt-4 text-lg font-bold">{title}</p>
      {(description || children) && <div className="mt-2 text-sm text-ink-500">{description}{children}</div>}
    </div>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'active' || status === 'open'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900'
      : status === 'disabled' || status === 'closed'
        ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900'
        : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900'
  return <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize', tone)}>{status}</span>
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])
  if (!open) return null
  // Rendered in a portal so a transformed or overflow-hidden ancestor (e.g. the
  // animated feed card that hosts the report button) cannot clip the dialog.
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'card animate-rise flex max-h-[92vh] w-full flex-col overflow-hidden rounded-b-none shadow-lift sm:rounded-3xl',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-ink-200/70 p-6 pb-4 dark:border-ink-800">
          <h2 className="text-xl font-bold">{title}</h2>
          <button className="btn-ghost p-2" onClick={onClose} aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-6 pt-4">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'danger',
  busy,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: ReactNode
  confirmLabel?: string
  tone?: 'danger' | 'primary'
  busy?: boolean
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="text-sm text-ink-600 dark:text-ink-300">{message}</div>
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className={tone === 'danger' ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy}>
          {busy && <Spinner className="size-4" />} {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

export function Toaster() {
  const { toasts } = useUi()
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[90] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'animate-rise pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-lift',
            t.tone === 'error' ? 'bg-red-600' : 'bg-ink-900 dark:bg-ink-800',
          )}
        >
          {t.tone === 'error' ? <AlertCircle className="size-4" /> : <CheckCircle2 className="size-4" />}
          {t.message}
        </div>
      ))}
    </div>
  )
}
