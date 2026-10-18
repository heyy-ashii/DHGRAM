import type { ChessColor } from '../../lib/types'
import { PIECE_PATHS, type PieceRole } from './pieces'

// Two colourways from the DHGRAM palette. White keeps the warm parchment fill
// with a dark outline; black is the warm ink with a light outline so it reads
// on both square colours.
const FILL: Record<ChessColor, Record<PieceRole, string>> = {
  w: { light: '#faf7f0', dark: '#faf7f0', none: 'none' },
  b: { light: '#1c1917', dark: '#1c1917', none: 'none' },
}
const STROKE: Record<ChessColor, Record<PieceRole, string>> = {
  w: { light: '#faf7f0', dark: '#12100e', none: 'none' },
  b: { light: '#f3efe6', dark: '#f3efe6', none: 'none' },
}

export default function ChessPiece({ type, color, className }: { type: string; color: ChessColor; className?: string }) {
  const paths = PIECE_PATHS[type] ?? []
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          transform={p.t}
          fill={FILL[color][p.fill]}
          stroke={STROKE[color][p.stroke]}
          strokeWidth={p.w}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}
