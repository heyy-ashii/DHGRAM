import { cn } from '../lib/utils'

const SIZES = {
  sm: 'size-9 text-sm',
  md: 'size-10 text-sm',
  lg: 'size-12 text-base',
  xl: 'size-16 text-xl',
} as const

export default function Avatar({
  user,
  size = 'md',
  className,
}: {
  user: { name?: string; avatar?: string | null }
  size?: keyof typeof SIZES
  className?: string
}) {
  const initial = (user.name ?? '').slice(0, 1).toUpperCase() || '?'
  if (user.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user.name ?? ''}
        className={cn('shrink-0 rounded-full object-cover ring-1 ring-slate-900/5 dark:ring-white/10', SIZES[size], className)}
      />
    )
  }
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-accent font-bold text-white shadow-sm', SIZES[size], className)}>
      {initial}
    </span>
  )
}
