import { MessageCircle, MessageSquare, Send, Timer, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { CREATOR_NAME } from '../lib/utils'
import BrandName from './BrandName'
import Logo from './Logo'

const YEAR = new Date().getFullYear()

const highlights = [
  { icon: Users, label: 'Message any student' },
  { icon: Timer, label: 'Chats clear after 30 days' },
  { icon: MessageSquare, label: 'Share public thoughts' },
]

export default function Footer() {
  const { setChatOpen } = useUi()
  const { user } = useAuth()
  return (
    <footer className="border-t border-neutral-200 bg-white pb-20 pt-12 md:pb-10 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-neutral-500">
            A chat-first space where students message each other one-to-one and share thoughts with everyone.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-neutral-500">
            {highlights.map((h) => (
              <li key={h.label} className="flex items-center gap-2">
                <h.icon className="size-4 text-brand" /> {h.label}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold">Chat</h3>
          <ul className="space-y-2 text-sm text-neutral-500">
            <li><Link className="hover:text-brand" to="/messages">Messages</Link></li>
            <li><Link className="hover:text-brand" to="/feed">Thoughts</Link></li>
            <li><Link className="hover:text-brand" to="/contact">Contact</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold">Start chatting</h3>
          <div className="flex flex-col gap-2">
            <Link to={user ? '/messages' : '/login'} className="btn-primary justify-start">
              <Send className="size-4" /> {user ? 'Open Messages' : 'Log in to chat'}
            </Link>
            <button type="button" className="btn-outline justify-start" onClick={() => setChatOpen(true)}>
              <MessageCircle className="size-4" /> Chat with Admin
            </button>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-10 flex max-w-6xl flex-col gap-2 border-t border-neutral-200 px-4 pt-6 text-xs text-neutral-500 sm:flex-row sm:justify-between dark:border-neutral-800">
        <p>© {YEAR} <BrandName />. All rights reserved.</p>
        <p>
          Created by <span className="font-semibold text-neutral-700 dark:text-neutral-300">{CREATOR_NAME}</span>
        </p>
      </div>
    </footer>
  )
}
