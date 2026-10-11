import { Link } from 'react-router-dom'
import { CREATOR_NAME } from '../lib/utils'
import BrandName from './BrandName'
import Logo from './Logo'

const YEAR = new Date().getFullYear()

export default function Footer() {
  return (
    <footer className="border-t border-neutral-200 bg-white pb-20 pt-8 md:pb-8 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Logo />
          <p className="mt-2 max-w-sm text-sm text-neutral-500">
            Share thoughts and message students, one-to-one or in groups.
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-4 text-sm text-neutral-500">
          <Link className="hover:text-brand" to="/messages">Messages</Link>
          <Link className="hover:text-brand" to="/feed">Thoughts</Link>
          <Link className="hover:text-brand" to="/about">About</Link>
        </nav>
      </div>
      <div className="mx-auto mt-6 flex max-w-6xl flex-col gap-1 border-t border-neutral-200 px-4 pt-4 text-xs text-neutral-500 sm:flex-row sm:justify-between dark:border-neutral-800">
        <p>© {YEAR} <BrandName />. All rights reserved.</p>
        <p>Created by <span className="font-semibold text-neutral-700 dark:text-neutral-300">{CREATOR_NAME}</span></p>
      </div>
    </footer>
  )
}

