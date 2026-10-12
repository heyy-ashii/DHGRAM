import { Home, LayoutDashboard, LogIn, LogOut, MessageCircle, MessageSquare, Moon, Sun, User as UserIcon, type LucideIcon } from 'lucide-react'
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
  const { user, isAdmin, logout } = useAuth()
  const [menu, setMenu] = useState(false)
  const navItems: NavItem[] = [...links, { key: 'profile', to: user ? `/u/${user.username}` : '/login', label: 'Profile', icon: UserIcon }]

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/80">
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
                    isActive ? 'surface-brand font-semibold' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white',
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
            {isAdmin && (
              <Link to="/admin" className="btn-outline hidden px-3 sm:inline-flex">
                <LayoutDashboard className="size-4" /> Admin
              </Link>
            )}
            {user ? (
              <div className="relative">
                <button className="rounded-full" onClick={() => setMenu((m) => !m)} aria-label="Account menu">
                  <Avatar user={user} size="sm" />
                </button>
                {menu && (
                  <>
                    <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setMenu(false)} tabIndex={-1} />
                    <div className="card absolute right-0 z-20 mt-2 w-52 overflow-hidden p-1.5 text-sm shadow-lift">
                      <div className="px-3 py-2">
                        <p className="truncate font-semibold">{user.name}</p>
                        <p className="truncate text-xs text-slate-500">@{user.username}</p>
                      </div>
                      <Link to={`/u/${user.username}`} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white" onClick={() => setMenu(false)}>
                        <UserIcon className="size-4" /> My profile
                      </Link>
                      {isAdmin && (
                        <Link to="/admin" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white" onClick={() => setMenu(false)}>
                          <LayoutDashboard className="size-4" /> Admin panel
                        </Link>
                      )}
                      <Link to="/account" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white" onClick={() => setMenu(false)}>
                        Account settings
                      </Link>
                      <button
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50"
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
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden dark:border-slate-800 dark:bg-slate-950/95"
        style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
        aria-label="Mobile"
      >
        {navItems.map((l) => (
          <NavLink
            key={l.key}
            to={l.to!}
            end={l.to === '/'}
            className={({ isActive }) =>
              cn('flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold uppercase tracking-wide transition', isActive ? 'text-brand' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200')
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
