import { Link } from 'react-router-dom'
import BrandName from './BrandName'
import { cn } from '../lib/utils'

export default function Logo({ to = '/', withText = true, className }: { to?: string; withText?: boolean; className?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2" aria-label="DHGRAM home">
      <img
        src="/dhgram-logo.png"
        alt="DHGRAM"
        className={cn('object-contain', className ?? 'size-9 rounded-lg')}
      />
      {withText && (
        <span className="font-heading text-lg font-extrabold tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>
          <BrandName />
        </span>
      )}
    </Link>
  )
}
