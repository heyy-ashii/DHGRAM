import { Link, NavLink } from 'react-router-dom'
import Avatar from './Avatar'
import Logo from './Logo'
import { useAuth } from '../context/AuthContext'
import { navItems } from '../lib/nav'
import { useChessInvites } from '../lib/queries'
import { cn } from '../lib/utils'

// Mobile chrome from the handoff: a compact 80px header with the logo (or the
// page title) plus the signed-in avatar, and a bottom navigation that stays at
// the viewport edge. Desktop uses Sidebar instead.
export default function Navbar({ title }: { title?: string }) {
  const { user } = useAuth()
  const links = navItems(user ? `/u/${user.username}` : '/login')
  const { data: invites } = useChessInvites(Boolean(user))
  const inviteCount = invites?.length ?? 0

  return (
    <>
      <header className="sticky top-0 z-40 flex h-20 items-center justify-between border-b border-ink-200 bg-white px-5 md:hidden dark:border-ink-800 dark:bg-ink-900">
        {title ? (
          <h1 className="truncate text-lg font-bold">{title}</h1>
        ) : (
          <Logo withText={false} className="h-14" />
        )}
        {user ? (
          <Link to={`/u/${user.username}`} aria-label="Your profile">
            <Avatar user={user} size="sm" className="size-8" />
          </Link>
        ) : (
          <Link to="/login" className="btn-dark px-3 text-xs">Log in</Link>
        )}
      </header>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-between border-t border-ink-200 bg-white px-3 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 md:hidden dark:border-ink-800 dark:bg-ink-900"
        aria-label="Mobile"
      >
        {links.map((l) => (
          <NavLink
            key={l.key}
            to={l.to}
            end={l.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex w-[84px] flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[10px] transition',
                isActive
                  ? 'bg-brand-soft font-bold text-brand dark:bg-brand/15 dark:text-blue-300'
                  : 'font-medium text-ink-500',
              )
            }
          >
            <l.icon className="size-5" strokeWidth={2} />
            <span className="relative">
              {l.label}
              {l.key === 'chess' && inviteCount > 0 && (
                <span className="absolute -right-3 -top-2 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[9px] font-bold text-white">
                  {inviteCount}
                </span>
              )}
            </span>
          </NavLink>
        ))}
      </nav>
    </>
  )
}
