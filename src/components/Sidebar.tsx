import { LayoutDashboard, LogIn, LogOut, Moon, Sun, User as UserIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import Avatar from './Avatar'
import BrandName from './BrandName'
import Logo from './Logo'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { navItems } from '../lib/nav'
import { cn } from '../lib/utils'

function Identity({ compact }: { compact?: boolean }) {
  const { user, isAdmin, logout } = useAuth()
  const { theme, toggleTheme } = useUi()
  const [menu, setMenu] = useState(false)

  return (
    <div className="relative">
      <button
        className="flex w-full items-center gap-3 rounded-[10px] px-1.5 py-1.5 text-left transition hover:bg-ink-100 dark:hover:bg-ink-800"
        onClick={() => setMenu((m) => !m)}
        aria-label="Account menu"
        aria-expanded={menu}
      >
        <Avatar user={user ?? { name: '?' }} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-bold">{user?.name ?? 'Guest'}</span>
          <span className="block truncate text-[11px] text-ink-400">@{user?.username ?? 'guest'}</span>
        </span>
      </button>

      {menu && (
        <>
          <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setMenu(false)} tabIndex={-1} />
          <div className={cn('card animate-rise absolute z-20 w-56 overflow-hidden p-1.5 text-sm shadow-lift', compact ? 'bottom-full mb-2 left-0' : 'bottom-full mb-2 left-0')}>
            <Link
              to={user ? `/u/${user.username}` : '/login'}
              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 font-medium hover:bg-ink-100 dark:hover:bg-ink-800"
              onClick={() => setMenu(false)}
            >
              <UserIcon className="size-4" /> My profile
            </Link>
            {user && (
              <Link
                to="/account"
                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 font-medium hover:bg-ink-100 dark:hover:bg-ink-800"
                onClick={() => setMenu(false)}
              >
                Account settings
              </Link>
            )}
            {isAdmin && (
              <Link
                to="/admin"
                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 font-medium hover:bg-ink-100 dark:hover:bg-ink-800"
                onClick={() => setMenu(false)}
              >
                <LayoutDashboard className="size-4" /> Admin panel
              </Link>
            )}
            <button
              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left font-medium hover:bg-ink-100 dark:hover:bg-ink-800"
              onClick={() => {
                toggleTheme()
                setMenu(false)
              }}
            >
              {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
            <div className="mx-1 my-1 h-px bg-ink-100 dark:bg-ink-800" />
            {user ? (
              <button
                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                onClick={async () => {
                  setMenu(false)
                  await logout()
                }}
              >
                <LogOut className="size-4" /> Logout
              </button>
            ) : (
              <Link
                to="/login"
                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 font-medium hover:bg-ink-100 dark:hover:bg-ink-800"
                onClick={() => setMenu(false)}
              >
                <LogIn className="size-4" /> Log in
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default function Sidebar() {
  const { user, isAdmin } = useAuth()
  const links = navItems(user ? `/u/${user.username}` : '/login')

  return (
    <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col justify-between border-r border-ink-200 bg-white px-5 py-7 md:flex dark:border-ink-800 dark:bg-ink-900">
      <div className="flex flex-col gap-[30px]">
        <Link to="/" className="flex h-24 items-center" aria-label="DHGRAM home">
          <Logo withText={false} className="h-16" />
        </Link>

        <nav className="flex flex-col gap-2" aria-label="Main">
          {links.map((l) => (
            <NavLink
              key={l.key}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) => cn('nav-item', isActive && 'nav-item-active')}
            >
              <l.icon className="size-5 shrink-0" strokeWidth={2} />
              <span className="truncate">{l.label}</span>
            </NavLink>
          ))}
        </nav>

        {isAdmin && (
          <Link to="/admin" className="nav-item">
            <LayoutDashboard className="size-5 shrink-0" strokeWidth={2} />
            <span>Admin</span>
          </Link>
        )}

        <div className="rounded-[16px] bg-ink-50 p-3.5 dark:bg-ink-950/50">
          <p className="text-xs font-semibold text-ink-900 dark:text-ink-100">A space for students.</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-500">Small thoughts. Real connections.</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="h-px bg-ink-200 dark:bg-ink-800" />
        {user ? (
          <Identity />
        ) : (
          <Link to="/login" className="btn-dark w-full">
            <LogIn className="size-4" /> Log in
          </Link>
        )}
        <p className="px-1.5 text-[10px] text-ink-400">
          <BrandName /> · Ashique.Pilassery
        </p>
      </div>
    </aside>
  )
}
