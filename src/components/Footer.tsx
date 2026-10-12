import { Link } from 'react-router-dom'
import { CREATOR_NAME } from '../lib/utils'
import BrandName from './BrandName'
import Logo from './Logo'

const YEAR = new Date().getFullYear()

export default function Footer() {
  return (
    <footer className="border-t border-ink-200/70 bg-white/60 pb-20 pt-10 md:pb-8 dark:border-ink-800/70 dark:bg-ink-950/60">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Logo />
          <p className="mt-2 max-w-sm text-sm text-ink-500">
            Share thoughts and message students, one-to-one or in groups.
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-5 text-sm font-medium text-ink-500">
          <Link className="transition hover:text-brand" to="/messages">Messages</Link>
          <Link className="transition hover:text-brand" to="/feed">Thoughts</Link>
          <Link className="transition hover:text-brand" to="/about">About</Link>
        </nav>
      </div>
      <div className="mx-auto mt-8 flex max-w-5xl flex-col gap-1 border-t border-ink-200/70 px-4 pt-4 text-xs text-ink-500 sm:flex-row sm:justify-between dark:border-ink-800/70">
        <p>© {YEAR} <BrandName />. All rights reserved.</p>
        <p>Created by <span className="font-semibold text-ink-700 dark:text-ink-300">{CREATOR_NAME}</span></p>
      </div>
    </footer>
  )
}
