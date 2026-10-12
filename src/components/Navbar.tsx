import { Home, LayoutDashboard, LogIn, LogOut, MessageCircle, MessageSquare, Moon, Sun, User as UserIcon, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import Avatar from './Avatar'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { cn } from '../lib/utils'
import Logo from './Logo'

type NavItem = { key: string; label: string; icon: LucideIcon; to?: string }

const baseLinks: NavItem[] = [
  { key: 'home', to: '/', label: 'Home', icon: Home },
  { key: 'feed', to: '/feed', label: 'Thoughts', icon: MessageSquare },
  { key: 'messages', to: '/messages', label: 'Messages', icon: MessageCircle },
]

export default function Navbar() {
  const { theme, toggleTheme } = useUi()
  const { user, isAdmin, logout } = useAuth()
  const [menu, setMenu] = useState(false)
  const navItems: NavItem[] = [
    ...baseLinks,
    { key: 'profile', to: user ? `/u/${user.username}` : '/login', label: 'Profile', icon: UserIcon },
  ]

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-ink-200/70 bg-ink-50/80 backdrop-blur-xl dark:border-ink-800/80 dark:bg-ink-950/80">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {navItems.map((l) => (
              <NavLink
                key={l.key}
                to={l.to!}
                end={l.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'relative rounded-full px-4 py-2 text-sm font-semibold transition',
                    isActive
                      ? 'text-brand'
                      : 'text-ink-500 hover:bg-ink-100 hover:text-ink-900 dark:hover:bg-ink-800 dark:hover:text-white',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {l.label}
                    {isActive && (
                      <span className="absolute inset-x-3 -bottom-[1px] h-0.5 rounded-full bg-brand" aria-hidden />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            <button
              className="btn-ghost p-2.5"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            </button>
            {isAdmin && (
              <Link to="/admin" className="btn-outline hidden px-3 sm:inline-flex">
                <LayoutDashboard className="size-4" /> Admin
              </Link>
            )}
            {user ? (
              <div className="relative">
                <button
                  className="rounded-full ring-brand/40 transition hover:ring-2"
                  onClick={() => setMenu((m) => !m)}
                  aria-label="Account menu"
                  aria-expanded={menu}
                >
                  <Avatar user={user} size="sm" />
                </button>
                {menu && (
                  <>
                    <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setMenu(false)} tabIndex={-1} />
                    <div className="card animate-rise absolute right-0 z-20 mt-2 w-52 origin-top-right overflow-hidden p-1.5 text-sm">
                      <div className="px-3 py-2.5">
                        <p className="truncate font-bold">{user.name}</p>
                        <p className="truncate text-xs text-ink-500">@{user.username}</p>
                      </div>
                      <div className="mx-1 mb-1 h-px bg-ink-100 dark:bg-ink-800" />
                      <Link
                        to={`/u/${user.username}`}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 font-medium hover:bg-ink-100 dark:hover:bg-ink-800"
                        onClick={() => setMenu(false)}
                      >
                        <UserIcon className="size-4" /> My profile
                      </Link>
                      {isAdmin && (
                        <Link
                          to="/admin"
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 font-medium hover:bg-ink-100 dark:hover:bg-ink-800"
                          onClick={() => setMenu(false)}
                        >
                          <LayoutDashboard className="size-4" /> Admin panel
                        </Link>
                      )}
                      <Link
                        to="/account"
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 font-medium hover:bg-ink-100 dark:hover:bg-ink-800"
                        onClick={() => setMenu(false)}
                      >
                        Account settings
                      </Link>
                      <button
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                        onClick={async () => {
                          setMenu(false)
                          await logout()
                        }}
                      >
                        <LogOut className="size-4" /> Logout
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Link to="/login" className="btn-dark px-4">
                <LogIn className="size-4" /> Login
              </Link>
            )}
          </div>
        </div>
      </header>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-ink-200/70 bg-ink-50/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden dark:border-ink-800/80 dark:bg-ink-950/90"
        style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
        aria-label="Mobile"
      >
        {navItems.map((l) => (
          <NavLink
            key={l.key}
            to={l.to!}
            end={l.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold uppercase tracking-wider transition',
                isActive ? 'text-brand' : 'text-ink-400',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'grid size-9 place-items-center rounded-full transition',
                    isActive && 'bg-brand-soft dark:bg-brand/15',
                  )}
                >
                  <l.icon className="size-[18px]" />
                </span>
                {l.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
