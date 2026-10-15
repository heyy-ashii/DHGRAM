import { Crown } from 'lucide-react'
import { useState } from 'react'
import Avatar from '../Avatar'
import { useAuth } from '../../context/AuthContext'
import { useChessInvites } from '../../lib/queries'
import { cn } from '../../lib/utils'
import { useChessInviteActions } from './ChessInvites'

// A floating notification in the bottom-right corner: it appears whenever a
// chess invitation is waiting and offers Accept (which opens the board) and
// Decline right there, so a student can answer without leaving the page they
// are on. Hidden for signed-out visitors and on the chess page itself, where the
// invitation is already on screen.
export default function ChessInviteBell() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const { data: invites } = useChessInvites(Boolean(user))
  const { accept, decline } = useChessInviteActions()

  const onChessPage = typeof window !== 'undefined' && window.location.pathname.startsWith('/chess')
  if (!user || onChessPage || !invites || invites.length === 0) return null

  return (
    <div className="fixed bottom-24 right-4 z-[70] md:bottom-6">
      {open && (
        <div className="card animate-rise mb-2 w-72 overflow-hidden p-1.5 shadow-lift">
          <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Chess invitations</p>
          {invites.map((inv) => (
            <div key={inv._id} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-ink-50 dark:hover:bg-ink-800/50">
              <Avatar user={inv.from} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{inv.from.name || 'Student'}</span>
              <button
                className="btn-primary px-2.5 py-1 text-xs"
                onClick={() => accept.mutate(inv._id)}
                disabled={accept.isPending || decline.isPending}
              >
                Accept
              </button>
              <button
                className="btn-ghost px-2 py-1 text-xs text-red-600"
                onClick={() => decline.mutate(inv._id)}
                disabled={accept.isPending || decline.isPending}
                aria-label={`Decline invite from ${inv.from.name}`}
              >
                Decline
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn('relative grid size-14 place-items-center rounded-full bg-brand text-white shadow-lift transition hover:scale-105')}
        aria-label={`${invites.length} chess invitation${invites.length === 1 ? '' : 's'}`}
        aria-expanded={open}
      >
        <Crown className="size-6" />
        <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-white ring-2 ring-white dark:ring-ink-900">
          {invites.length}
        </span>
      </button>
    </div>
  )
}
