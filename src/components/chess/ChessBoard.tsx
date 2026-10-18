import { Chess, type Square } from 'chess.js'
import { useMemo, useState } from 'react'
import type { ChessColor } from '../../lib/types'
import { cn } from '../../lib/utils'

// Unicode glyphs for the board. Using text rather than an image set keeps the
// bundle small and lets the pieces inherit the warm palette.
const GLYPHS: Record<string, string> = {
  p: '♟',
  n: '♞',
  b: '♝',
  r: '♜',
  q: '♛',
  k: '♚',
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1']

type Piece = { type: string; color: ChessColor }

// Parse the piece placement field of a FEN into an 8x8 grid of { type, color }.
function parseFen(fen: string): (Piece | null)[][] {
  const rows = fen.split(' ')[0].split('/')
  return rows.map((row) => {
    const cells: (Piece | null)[] = []
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < Number(ch); i++) cells.push(null)
      } else {
        cells.push({ type: ch.toLowerCase(), color: ch === ch.toUpperCase() ? 'w' : 'b' })
      }
    }
    return cells
  })
}

type Promotion = 'q' | 'r' | 'b' | 'n'

export default function ChessBoard({
  fen,
  myColor,
  interactive,
  onMove,
  lastMove,
}: {
  fen: string
  myColor: ChessColor
  interactive: boolean
  onMove: (from: string, to: string, promotion?: Promotion) => void
  lastMove?: { from: string; to: string } | null
}) {
  // Selection is tagged with the position it was made on, so when the board
  // changes (our move landed, or the opponent moved) the stale selection is
  // dropped during render rather than in an effect.
  const [sel, setSel] = useState<{ fen: string; square: Square } | null>(null)
  const [promotion, setPromotion] = useState<{ fen: string; from: Square; to: Square } | null>(null)

  // A fresh instance per position is cheap and keeps legal-move lookups honest.
  const chess = useMemo(() => new Chess(fen), [fen])
  const board = useMemo(() => parseFen(fen), [fen])

  const selected = sel && sel.fen === fen ? sel.square : null
  const pendingPromotion = promotion && promotion.fen === fen ? promotion : null
  const setSelected = (square: Square | null) => setSel(square ? { fen, square } : null)

  const targets = useMemo(() => {
    if (!selected || !interactive) return new Map<string, boolean>()
    const moves = chess.moves({ square: selected, verbose: true })
    return new Map(moves.map((m) => [m.to, Boolean(m.captured)]))
  }, [selected, interactive, chess])

  const myTurn = interactive && chess.turn() === myColor

  const pick = (square: Square) => {
    if (!myTurn) return
    const piece = chess.get(square)
    if (selected) {
      if (square === selected) {
        setSelected(null)
        return
      }
      if (targets.has(square)) {
        // A pawn reaching the last rank must promote; ask before sending.
        const isPromotion = chess.get(selected)?.type === 'p' && (square[1] === '8' || square[1] === '1')
        if (isPromotion) {
          setPromotion({ fen, from: selected, to: square })
          return
        }
        onMove(selected, square)
        setSelected(null)
        return
      }
    }
    if (piece && piece.color === myColor) setSelected(square)
    else setSelected(null)
  }

  // The board is drawn from White's perspective for White, flipped for Black.
  const rankOrder = myColor === 'w' ? RANKS : [...RANKS].reverse()
  const fileOrder = myColor === 'w' ? FILES : [...FILES].reverse()

  return (
    <div className="relative w-full">
      {/* `@container` makes the board the sizing context, so pieces and markers
          sized in `cqw` always track the squares — whether the board is
          squeezed by the sidebar or blown up in fullscreen. */}
      <div className="@container grid aspect-square w-full grid-cols-8 overflow-hidden rounded-[16px] shadow-lift ring-1 ring-ink-300 dark:ring-ink-700">
        {rankOrder.map((rank, ri) =>
          fileOrder.map((file, fi) => {
            const square = `${file}${rank}` as Square
            const light = (FILES.indexOf(file) + Number(rank)) % 2 === 0
            const piece = board[8 - Number(rank)][FILES.indexOf(file)]
            const isTarget = targets.has(square)
            const isCapture = targets.get(square)
            const isSelected = selected === square
            const isLast = lastMove && (lastMove.from === square || lastMove.to === square)
            return (
              <button
                key={square}
                type="button"
                onClick={() => pick(square)}
                aria-label={`${square}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ''}`}
                className={cn(
                  'relative grid place-items-center transition-colors',
                  light ? 'bg-[#efe4cd]' : 'bg-[#c9a97e]',
                  myTurn && 'cursor-pointer',
                  isLast && 'after:absolute after:inset-0 after:bg-amber-400/35',
                  isSelected && 'after:absolute after:inset-0 after:bg-brand/40',
                )}
              >
                {/* File/rank labels sit on the outer edge only. */}
                {fi === 0 && <span className={cn('absolute left-[2%] top-[2%] text-[1.7cqw] font-semibold leading-none', light ? 'text-[#a5825a]' : 'text-[#efe4cd]')}>{rank}</span>}
                {ri === 7 && <span className={cn('absolute bottom-[2%] right-[2%] text-[1.7cqw] font-semibold leading-none', light ? 'text-[#a5825a]' : 'text-[#efe4cd]')}>{file}</span>}
                {piece && (
                  <span
                    className={cn(
                      'relative z-10 select-none text-[7cqw] leading-none',
                      piece.color === 'w' ? 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.65)]' : 'text-ink-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.35)]',
                    )}
                  >
                    {GLYPHS[piece.type]}
                  </span>
                )}
                {isTarget && !isCapture && <span className="absolute z-20 size-[26%] rounded-full bg-ink-900/25" />}
                {isTarget && isCapture && <span className="absolute inset-[8%] z-20 rounded-full ring-4 ring-ink-900/30" />}
              </button>
            )
          }),
        )}
      </div>

      {pendingPromotion && (
        <div className="absolute inset-0 z-30 grid place-items-center rounded-[16px] bg-ink-950/60 backdrop-blur-sm">
          <div className="panel animate-pop flex flex-col items-center gap-3 p-5">
            <p className="text-sm font-semibold">Promote to</p>
            <div className="flex gap-2">
              {(['q', 'r', 'b', 'n'] as Promotion[]).map((p) => (
                <button
                  key={p}
                  className="grid size-12 place-items-center rounded-xl bg-ink-100 text-3xl hover:bg-brand-soft dark:bg-ink-800 dark:hover:bg-brand/20"
                  onClick={() => {
                    onMove(pendingPromotion.from, pendingPromotion.to, p)
                    setPromotion(null)
                    setSelected(null)
                  }}
                  aria-label={`Promote to ${p}`}
                >
                  {GLYPHS[p]}
                </button>
              ))}
            </div>
            <button className="btn-ghost text-xs" onClick={() => setPromotion(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
