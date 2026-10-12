import { ExternalLink, LayoutDashboard, LogOut, MessageCircle, Moon, Sun, Users } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import Logo from '../../components/Logo'
import { Toaster } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useUi } from '../../context/UiContext'
import { useStats } from '../../lib/queries'
import { cn } from '../../lib/utils'

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const { theme, toggleTheme, toast } = useUi()
  const navigate = useNavigate()
  const { data: stats } = useStats()

  const items = [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/messages', label: 'Messages', icon: MessageCircle, badge: stats?.unreadMessages },
  ]

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-b border-neutral-200 bg-white md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex h-16 items-center justify-between px-4">
          <Logo to="/admin" />
          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">Admin</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0" aria-label="Admin">
          {items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.end}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                  isActive
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                    : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800',
                )
              }
            >
              <i.icon className="size-4" /> {i.label}
              {Boolean(i.badge) && <span className="ml-auto rounded-full bg-red-600 px-1.5 text-xs text-white">{i.badge}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="hidden space-y-1 px-3 pt-6 md:block">
          <NavLink to="/" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800">
            <ExternalLink className="size-4" /> View public site
          </NavLink>
          <button onClick={toggleTheme} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800">
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />} {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex h-16 items-center justify-between gap-4 border-b border-neutral-200 bg-white px-6 dark:border-neutral-800 dark:bg-neutral-950">
          <p className="truncate text-sm text-neutral-500">
            Signed in as <span className="font-semibold text-neutral-900 dark:text-white">{user?.name}</span>
          </p>
          <button
            className="btn-outline px-3"
            onClick={async () => {
              await logout()
              toast('Logged out')
              navigate('/login')
            }}
          >
            <LogOut className="size-4" /> Logout
          </button>
        </header>
        <main className="p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  )
}
