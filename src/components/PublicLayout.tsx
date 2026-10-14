import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Footer from './Footer'
import Navbar from './Navbar'
import Sidebar from './Sidebar'
import { Toaster } from './ui'

// Mobile header titles per route; Home falls back to the logo.
const TITLES: Record<string, string> = {
  '/feed': 'Thoughts',
  '/messages': 'Messages',
  '/account': 'Account',
  '/about': 'About',
  '/contact': 'Contact',
  '/login': 'Log in',
}
function titleFor(pathname: string): string | undefined {
  if (pathname === '/profile' || pathname.startsWith('/u/')) return 'Profile'
  return TITLES[pathname]
}

export default function PublicLayout() {
  const { pathname } = useLocation()
  // The marketing pages keep the footer; the app screens are footer-less.
  const marketing = pathname === '/about' || pathname === '/contact'
  // Log in brings its own full-bleed chrome, so it skips the app shell.
  const standalone = pathname === '/login'

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  if (standalone) {
    return (
      <div className="min-h-screen">
        <Outlet />
        <Toaster />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar title={titleFor(pathname)} />
        <main id="main" className="flex min-w-0 flex-1 flex-col">
          <Outlet />
        </main>
        {marketing && <Footer />}
        {/* Reserves space above the fixed mobile bottom navigation. */}
        <div className="h-[92px] shrink-0 md:hidden" aria-hidden />
      </div>
      <Toaster />
    </div>
  )
}
