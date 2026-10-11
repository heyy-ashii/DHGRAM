import { Loader2, X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
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

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card mx-auto max-w-md p-8 text-center">
      <p className="font-semibold">Something went wrong</p>
      <p className="mt-1 text-sm text-neutral-500">{message}</p>
      {onRetry && (
        <button className="btn-outline mt-4" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card mx-auto max-w-md p-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-3 text-sm text-neutral-500">{children}</div>}
    </div>
  )
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
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn('card max-h-[92vh] w-full overflow-y-auto rounded-b-none p-6 sm:rounded-2xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="btn-ghost p-2" onClick={onClose} aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Toaster() {
  const { toasts } = useUi()
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg',
            t.tone === 'error' ? 'bg-red-600' : 'bg-neutral-900 dark:bg-neutral-700',
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
