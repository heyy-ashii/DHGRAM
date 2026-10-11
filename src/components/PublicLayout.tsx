import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Footer from './Footer'
import Navbar from './Navbar'
import { Toaster } from './ui'
import { cn } from '../lib/utils'

export default function PublicLayout() {
  const { pathname } = useLocation()
  // Messages is a full-screen workspace: no footer.
  const fullScreen = pathname.startsWith('/messages')
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Navbar />
      <main id="main" className={cn(fullScreen ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'flex-1')}>
        <Outlet />
      </main>
      {!fullScreen && <Footer />}
      <Toaster />
    </div>
  )
}
