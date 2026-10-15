import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Crown, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Avatar from '../Avatar'
import { Spinner } from '../ui'
import { useUi } from '../../context/UiContext'
import { api, errorMessage } from '../../lib/api'
import type { ChessInvite } from '../../lib/types'
import { useChessInvites } from '../../lib/queries'
import { formatShort } from '../../lib/utils'

// Shared accept/decline handlers for a chess invitation. Accepting opens the
// board; declining removes the invite for both sides.
export function useChessInviteActions() {
  const qc = useQueryClient()
  const { toast } = useUi()
  const navigate = useNavigate()

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['chess'] })
  }

  const accept = useMutation({
    mutationFn: (id: string) => api<{ data: { game: { _id: string } } }>(`/chess/${id}/accept`, { method: 'POST' }),
    onSuccess: (res) => {
      invalidate()
      navigate(`/chess?g=${res.data.game._id}`)
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  })

  const decline = useMutation({
    mutationFn: (id: string) => api(`/chess/${id}/decline`, { method: 'POST' }),
    onSuccess: () => {
      invalidate()
      toast('Invitation declined')
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  })

  return { accept, decline }
}

// One invitation row with Accept and Decline, for the Messages sidebar.
export function ChessInviteRow({ invite }: { invite: ChessInvite }) {
  const { accept, decline } = useChessInviteActions()
  const busy = accept.isPending || decline.isPending

  return (
    <div className="flex items-center gap-3 border-b border-ink-100 px-4 py-3 dark:border-ink-800">
      <span className="relative shrink-0">
        <Avatar user={invite.from} />
        <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-amber-500 text-white ring-2 ring-white dark:ring-ink-900">
          <Crown className="size-3" />
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{invite.from.name || 'Student'}</p>
        <p className="truncate text-xs text-ink-500">
          Chess invite · {formatShort(invite.createdAt)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          className="btn-primary px-2.5 py-1.5 text-xs"
          onClick={() => accept.mutate(invite._id)}
          disabled={busy}
          aria-label={`Accept chess invite from ${invite.from.name}`}
        >
          {accept.isPending ? <Spinner className="size-3.5" /> : <Check className="size-3.5" />} Accept
        </button>
        <button
          className="btn-ghost px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50"
          onClick={() => decline.mutate(invite._id)}
          disabled={busy}
          aria-label={`Decline chess invite from ${invite.from.name}`}
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

// A small header strip above the Messages list. Renders nothing when there is
// nothing waiting, so it does not add noise to an empty inbox.
export function ChessInvitesStrip() {
  const { data: invites } = useChessInvites()
  if (!invites || invites.length === 0) return null
  return (
    <div className="border-b border-ink-100 dark:border-ink-800">
      <p className="flex items-center gap-1.5 px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
        <Crown className="size-3.5 text-amber-500" /> Chess invitations
      </p>
      {invites.map((invite) => (
        <ChessInviteRow key={invite._id} invite={invite} />
      ))}
    </div>
  )
}
