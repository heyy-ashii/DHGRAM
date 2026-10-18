import { Chess } from 'chess.js'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, Crown, Flag, Handshake, Maximize2, Minimize2, Plus, Repeat, Search, Swords, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Avatar from '../components/Avatar'
import ChessBoard from '../components/chess/ChessBoard'
import { ChessInviteRow } from '../components/chess/ChessInvites'
import { EmptyState, Modal, PageSpinner, Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { api, errorMessage } from '../lib/api'
import type { ChessColor, ChessGame } from '../lib/types'
import { useChessDirectory, useChessGame, useChessGames, useChessInvites } from '../lib/queries'
import { usePageMeta } from '../lib/usePageMeta'
import { cn, formatShort } from '../lib/utils'

const COLOR_LABEL: Record<ChessColor, string> = { w: 'White', b: 'Black' }

// The last played move, replayed from the SAN list so the board can highlight it.
function lastMoveOf(moves: string[]): { from: string; to: string } | null {
  const chess = new Chess()
  let last: { from: string; to: string } | null = null
  for (const san of moves) {
    try {
      const m = chess.move(san)
      last = { from: m.from, to: m.to }
    } catch {
      return last
    }
  }
  return last
}

function resultText(game: ChessGame) {
  if (game.status !== 'finished') return null
  if (game.result === 'draw') return `Draw${game.resultReason ? ` · ${game.resultReason}` : ''}`
  const winnerName = game.result === 'w' ? game.white.name : game.black.name
  const youWon = game.result === game.myColor
  return `${youWon ? 'You won' : `${winnerName} won`}${game.resultReason ? ` · ${game.resultReason}` : ''}`
}

// A single game row in the left list.
function GameRow({ game, active, onOpen }: { game: ChessGame; active: boolean; onOpen: () => void }) {
  const subtitle =
    game.status === 'pending'
      ? 'Invitation sent'
      : game.status === 'finished'
        ? resultText(game)
        : game.myTurn
          ? 'Your move'
          : 'Waiting for opponent'
  return (
    <button
      onClick={onOpen}
      className={cn(
        'flex w-full items-center gap-3 border-b border-ink-100 px-4 py-3 text-left hover:bg-ink-50 dark:border-ink-800 dark:hover:bg-ink-800/40',
        active && 'bg-brand-soft dark:bg-brand/15',
      )}
    >
      <span className="relative shrink-0">
        <Avatar user={game.opponent} />
        <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-ink-900 text-[9px] font-bold text-white ring-2 ring-white dark:bg-ink-700 dark:ring-ink-900">
          {game.myColor === 'w' ? '♔' : '♚'}
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-semibold">{game.opponent.name || 'Student'}</span>
          <span className="shrink-0 text-[11px] text-ink-400">{formatShort(game.lastMoveAt)}</span>
        </div>
        <span className={cn('block truncate text-sm', game.myTurn ? 'font-medium text-brand' : 'text-ink-500')}>{subtitle}</span>
      </div>
    </button>
  )
}

// The invite picker: search the student directory, choose a colour, send.
function NewChessInviteModal({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: (id: string) => void }) {
  const qc = useQueryClient()
  const { toast } = useUi()
  const [q, setQ] = useState('')
  const [color, setColor] = useState<'white' | 'black' | 'random'>('random')
  const { data: users, isLoading } = useChessDirectory(q, open)
  const invite = useMutation({
    mutationFn: (userId: string) =>
      api<{ data: { game: ChessGame } }>('/chess/invite', { method: 'POST', body: { userId, color } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['chess'] })
      toast('Invitation sent')
      onClose()
      onInvited(res.data.game._id)
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  })
  const students = users ?? []

  return (
    <Modal open={open} onClose={onClose} title="New chess game">
      <div className="space-y-4">
        <div>
          <span className="label">You play as</span>
          <div className="flex gap-2">
            {(['white', 'black', 'random'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn(
                  'flex-1 rounded-[10px] py-2.5 text-xs font-bold capitalize transition',
                  color === c ? 'bg-brand text-white' : 'text-ink-500 ring-1 ring-ink-200 hover:bg-ink-100 dark:ring-ink-700 dark:hover:bg-ink-800',
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">Opponent</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <input
              className="input pl-9"
              placeholder="Search students…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
              aria-label="Search students"
            />
          </div>
          <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-ink-200 dark:border-ink-800">
            {isLoading ? (
              <div className="grid place-items-center py-8"><Spinner /></div>
            ) : students.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-500">No students found.</p>
            ) : (
              students.map((u) => (
                <button
                  key={u._id}
                  type="button"
                  disabled={invite.isPending}
                  onClick={() => invite.mutate(u._id)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-ink-100 disabled:opacity-50 dark:hover:bg-ink-800"
                >
                  <Avatar user={u} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{u.name}</p>
                    <p className="truncate text-xs text-ink-500">{u.username ? `@${u.username}` : 'No account yet'}</p>
                  </div>
                  <Crown className="size-4 text-amber-500" />
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

// The board and controls for one game.
function GamePanel({ game, onBack }: { game: ChessGame; onBack: () => void }) {
  const qc = useQueryClient()
  const { toast } = useUi()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['chess'] })

  // Fullscreen: the whole board-and-controls panel expands over the app. It is
  // entered automatically when a pending game becomes active (accepting an
  // invite, or an invite we sent being accepted), and can be toggled by hand.
  const [fullscreen, setFullscreen] = useState(false)
  const prevStatus = useRef(game.status)

  // A finished game never stays fullscreen, so derive it rather than reset it.
  const isFullscreen = fullscreen && game.status !== 'finished'

  useEffect(() => {
    if (prevStatus.current === 'pending' && game.status === 'active') setFullscreen(true)
    prevStatus.current = game.status
  }, [game.status])

  // Esc leaves fullscreen, and while it is open the page behind cannot scroll.
  useEffect(() => {
    if (!isFullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [isFullscreen])

  const move = useMutation({
    mutationFn: ({ from, to, promotion }: { from: string; to: string; promotion?: string }) =>
      api(`/chess/${game._id}/move`, { method: 'POST', body: { from, to, promotion } }),
    onSuccess: invalidate,
    onError: (err) => toast(errorMessage(err), 'error'),
  })
  const resign = useMutation({
    mutationFn: () => api(`/chess/${game._id}/resign`, { method: 'POST' }),
    onSuccess: invalidate,
    onError: (err) => toast(errorMessage(err), 'error'),
  })
  const draw = useMutation({
    mutationFn: (action: 'offer' | 'accept' | 'decline') => api(`/chess/${game._id}/draw`, { method: 'POST', body: { action } }),
    onSuccess: invalidate,
    onError: (err) => toast(errorMessage(err), 'error'),
  })
  const accept = useMutation({
    mutationFn: () => api(`/chess/${game._id}/accept`, { method: 'POST' }),
    onSuccess: invalidate,
    onError: (err) => toast(errorMessage(err), 'error'),
  })
  const decline = useMutation({
    mutationFn: () => api(`/chess/${game._id}/decline`, { method: 'POST' }),
    onSuccess: () => { invalidate(); onBack() },
    onError: (err) => toast(errorMessage(err), 'error'),
  })
  const rematch = useMutation({
    mutationFn: () => api<{ data: { game: ChessGame } }>(`/chess/${game._id}/rematch`, { method: 'POST' }),
    onSuccess: invalidate,
    onError: (err) => toast(errorMessage(err), 'error'),
  })

  const lastMove = useMemo(() => lastMoveOf(game.moves), [game.moves])
  const busy = move.isPending || resign.isPending || draw.isPending

  // The status line above the board.
  let status: React.ReactNode
  if (game.status === 'pending') {
    status = <span className="text-amber-600 dark:text-amber-400">Waiting for {game.opponent.name} to accept…</span>
  } else if (game.status === 'finished') {
    status = <span className="font-semibold">{resultText(game)}</span>
  } else if (game.check && game.myTurn) {
    status = <span className="font-semibold text-red-600 dark:text-red-400">You are in check</span>
  } else if (game.myTurn) {
    status = <span className="font-semibold text-brand">Your move</span>
  } else {
    status = <span className="text-ink-500">Waiting for {game.opponent.name}…</span>
  }

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col overflow-y-auto',
        isFullscreen && 'fixed inset-0 z-50 h-auto bg-ink-50 dark:bg-ink-950',
      )}
    >
      <header className="flex items-center gap-3 border-b border-ink-200 bg-white px-5 py-4 dark:border-ink-800 dark:bg-ink-900">
        <button className="grid size-9 place-items-center rounded-[10px] text-ink-500 hover:bg-ink-100 md:hidden dark:hover:bg-ink-800" onClick={onBack} aria-label="Back to games">
          <ArrowLeft className="size-5" />
        </button>
        <Swords className="size-5 text-brand" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{game.opponent.name || 'Student'}</p>
          <p className="truncate text-xs text-ink-500">You play {COLOR_LABEL[game.myColor]}</p>
        </div>
        <button
          className="grid size-9 place-items-center rounded-[10px] text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800"
          onClick={() => setFullscreen((v) => !v)}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
        </button>
      </header>

      <div className="flex flex-1 flex-col items-center gap-5 p-5">
        <div className={cn('w-full', isFullscreen ? 'max-w-[min(94vw,calc(100dvh-15rem))]' : 'max-w-[520px]')}>
          {/* The opponent sits at the top of the board, the caller at the bottom. */}
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar user={game.opponent} size="sm" />
              <span className="text-sm font-medium">{game.opponent.name}</span>
              <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-500 dark:bg-ink-800 dark:text-ink-400">
                {COLOR_LABEL[game.myColor === 'w' ? 'b' : 'w']}
              </span>
            </div>
            {game.status === 'active' && game.turn !== game.myColor && <Spinner className="size-4 text-ink-400" />}
          </div>

          <ChessBoard
            fen={game.fen}
            myColor={game.myColor}
            interactive={game.status === 'active' && game.myTurn && !busy}
            onMove={(from, to, promotion) => move.mutate({ from, to, promotion })}
            lastMove={lastMove}
          />

          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar user={game.myColor === 'w' ? game.white : game.black} size="sm" />
              <span className="text-sm font-medium">You</span>
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">
                {COLOR_LABEL[game.myColor]}
              </span>
            </div>
          </div>
        </div>

        <p className="text-center text-sm">{status}</p>

        {game.status === 'active' && (
          <div className="flex w-full max-w-[520px] flex-wrap justify-center gap-2">
            {game.drawOfferByOpponent ? (
              <>
                <button className="btn-primary" onClick={() => draw.mutate('accept')} disabled={busy}>
                  <Handshake className="size-4" /> Accept draw
                </button>
                <button className="btn-outline" onClick={() => draw.mutate('decline')} disabled={busy}>Decline draw</button>
              </>
            ) : game.drawOfferByMe ? (
              <span className="text-xs text-ink-500">Draw offered…</span>
            ) : (
              <button className="btn-outline" onClick={() => draw.mutate('offer')} disabled={busy}>
                <Handshake className="size-4" /> Offer draw
              </button>
            )}
            <button className="btn-outline text-red-600" onClick={() => resign.mutate()} disabled={busy}>
              <Flag className="size-4" /> Resign
            </button>
          </div>
        )}

        {game.status === 'finished' && (
          <button className="btn-primary" onClick={() => rematch.mutate()} disabled={rematch.isPending}>
            {rematch.isPending ? <Spinner className="size-4" /> : <Repeat className="size-4" />} Rematch
          </button>
        )}

        {game.status === 'pending' && (
          game.invitedByMe ? (
            <p className="text-xs text-ink-500">Waiting for them to accept or decline from their Messages.</p>
          ) : (
            <div className="flex gap-2">
              <button className="btn-primary" onClick={() => accept.mutate()} disabled={accept.isPending || decline.isPending}>
                {accept.isPending ? <Spinner className="size-4" /> : <Check className="size-4" />} Accept
              </button>
              <button className="btn-outline text-red-600" onClick={() => decline.mutate()} disabled={accept.isPending || decline.isPending}>
                <X className="size-4" /> Decline
              </button>
            </div>
          )
        )}

        {/* Move list */}
        {game.moves.length > 0 && (
          <div className="w-full max-w-[520px] rounded-[16px] bg-ink-50 p-4 dark:bg-ink-900/50">
            <p className="eyebrow mb-2">Moves</p>
            <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {game.moves.map((san, i) => (
                <li key={i} className="tabular-nums text-ink-600 dark:text-ink-300">
                  {i % 2 === 0 ? `${i / 2 + 1}.` : ''} {san}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ChessPage() {
  usePageMeta('Chess')
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const selected = params.get('g')
  const [picker, setPicker] = useState(false)
  const { data: games, isLoading } = useChessGames(Boolean(user))
  const { data: invites } = useChessInvites(Boolean(user))
  const { data: game, isLoading: gameLoading, isError: gameError } = useChessGame(selected ?? undefined)

  // Drop a stale ?g= that no longer resolves (a declined invite, a deleted game).
  useEffect(() => {
    if (selected && !gameLoading && gameError) setParams({}, { replace: true })
  }, [selected, gameLoading, gameError, setParams])

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <EmptyState title="Log in to play chess">
          <Link to="/login" className="btn-primary mt-2">Log in</Link>
        </EmptyState>
      </div>
    )
  }

  const open = (id: string) => setParams({ g: id })

  const active = (games ?? []).filter((g) => g.status === 'active')
  const sent = (games ?? []).filter((g) => g.status === 'pending' && g.invitedByMe)
  const finished = (games ?? []).filter((g) => g.status === 'finished')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="card mx-5 my-5 flex min-h-0 flex-1 overflow-hidden md:mx-10 md:my-8 md:grid md:grid-cols-[320px_1fr]">
        <div className={cn('flex min-h-0 flex-col bg-white md:border-r md:border-ink-200 dark:bg-ink-900 dark:md:border-ink-800', selected && 'hidden md:flex')}>
          <div className="flex flex-col gap-4 p-5">
            <div className="flex items-center justify-between">
              <h1 className="font-heading text-[28px] font-semibold leading-8 tracking-[-0.5px]">Chess</h1>
              <Crown className="size-6 text-amber-500" />
            </div>
            <button className="btn-primary" onClick={() => setPicker(true)}>
              <Plus className="size-4" /> New game
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {invites && invites.length > 0 && (
              <div className="border-b border-ink-100 dark:border-ink-800">
                <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Invitations</p>
                {invites.map((inv) => (
                  <ChessInviteRow key={inv._id} invite={inv} />
                ))}
              </div>
            )}

            {isLoading ? (
              <PageSpinner />
            ) : (games ?? []).length === 0 && (!invites || invites.length === 0) ? (
              <div className="p-6 text-center text-sm text-ink-500">
                <Swords className="mx-auto mb-2 size-6 opacity-40" aria-hidden />
                <p>No games yet.</p>
                <button className="btn-outline mt-3" onClick={() => setPicker(true)}>Invite a classmate</button>
              </div>
            ) : (
              <>
                {active.length > 0 && (
                  <div>
                    <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Your games</p>
                    {active.map((g) => <GameRow key={g._id} game={g} active={selected === g._id} onOpen={() => open(g._id)} />)}
                  </div>
                )}
                {sent.length > 0 && (
                  <div>
                    <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Invitations sent</p>
                    {sent.map((g) => <GameRow key={g._id} game={g} active={selected === g._id} onOpen={() => open(g._id)} />)}
                  </div>
                )}
                {finished.length > 0 && (
                  <div>
                    <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Finished</p>
                    {finished.map((g) => <GameRow key={g._id} game={g} active={selected === g._id} onOpen={() => open(g._id)} />)}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className={cn('flex min-h-0 flex-col overflow-hidden bg-ink-50 dark:bg-ink-950/40', !selected && 'hidden md:block')}>
          {selected ? (
            gameLoading && !game ? (
              <PageSpinner />
            ) : game ? (
              <GamePanel key={game._id} game={game} onBack={() => setParams({}, { replace: true })} />
            ) : null
          ) : (
            <div className="grid h-full place-items-center p-8 text-center text-sm text-ink-500">
              <div>
                <Swords className="mx-auto mb-2 size-6 opacity-40" aria-hidden />
                Pick a game, or invite a classmate to play.
              </div>
            </div>
          )}
        </div>
      </div>

      <NewChessInviteModal open={picker} onClose={() => setPicker(false)} onInvited={(id) => open(id)} />
    </div>
  )
}
