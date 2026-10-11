import { Home, LogIn, LogOut, MessageCircle, MessageSquare, Moon, Sun, User as UserIcon, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import Avatar from './Avatar'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { cn } from '../lib/utils'
import Logo from './Logo'

type NavItem = { key: string; label: string; icon: LucideIcon; to?: string }

const links: NavItem[] = [
  { key: 'home', to: '/', label: 'Home', icon: Home },
  { key: 'feed', to: '/feed', label: 'Thoughts', icon: MessageSquare },
  { key: 'messages', to: '/messages', label: 'Messages', icon: MessageCircle },
]

export default function Navbar() {
  const { theme, toggleTheme } = useUi()
  const { user, logout } = useAuth()
  const [menu, setMenu] = useState(false)
  const navItems: NavItem[] = [...links, { key: 'profile', to: user ? `/u/${user.username}` : '/login', label: 'Profile', icon: UserIcon }]

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/85 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/85">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {navItems.map((l) => (
              <NavLink
                key={l.key}
                to={l.to!}
                end={l.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'rounded-full px-4 py-2 text-sm font-medium transition',
                    isActive ? 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white' : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white',
                  )
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button className="btn-ghost p-2" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
              {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            {user ? (
              <div className="relative">
                <button className="rounded-full" onClick={() => setMenu((m) => !m)} aria-label="Account menu">
                  <Avatar user={user} size="sm" />
                </button>
                {menu && (
                  <>
                    <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setMenu(false)} tabIndex={-1} />
                    <div className="card absolute right-0 z-20 mt-2 w-48 overflow-hidden p-1 text-sm">
                      <div className="px-3 py-2">
                        <p className="truncate font-semibold">{user.name}</p>
                        <p className="truncate text-xs text-neutral-500">@{user.username}</p>
                      </div>
                      <Link to={`/u/${user.username}`} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={() => setMenu(false)}>
                        <UserIcon className="size-4" /> My profile
                      </Link>
                      <Link to="/account" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={() => setMenu(false)}>
                        Account settings
                      </Link>
                      <button
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                        onClick={async () => { setMenu(false); await logout() }}
                      >
                        <LogOut className="size-4" /> Logout
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Link to="/login" className="btn-dark px-3">
                <LogIn className="size-4" /> Login
              </Link>
            )}
          </div>
        </div>
      </header>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden dark:border-neutral-800 dark:bg-neutral-950"
        style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
        aria-label="Mobile"
      >
        {navItems.map((l) => (
          <NavLink
            key={l.key}
            to={l.to!}
            end={l.to === '/'}
            className={({ isActive }) =>
              cn('flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold uppercase tracking-wide', isActive ? 'text-neutral-900 dark:text-white' : 'text-neutral-400')
            }
          >
            <l.icon className="size-5" />
            {l.label}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
