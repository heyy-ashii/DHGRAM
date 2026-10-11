import { Code2, LogOut, Mail, MessageCircle, MessageSquare, Timer, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import AuthPanel from './AuthPanel'
import BrandName from './BrandName'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { CONTACT_EMAIL, CREATOR_NAME } from '../lib/utils'

const credits = [{ name: CREATOR_NAME, role: 'Founder · Design & Full-stack Development', icon: Code2 }]

const steps = [
  { icon: MessageSquare, title: 'Share thoughts', text: 'Any signed-in student can post a thought to the public feed.' },
  { icon: Users, title: 'Chat with anyone', text: 'Open Messages to find every student and start a conversation.' },
  { icon: Timer, title: 'Stays fresh', text: 'Messages clear automatically after 30 days, so nothing piles up.' },
]

// The former About page, now shown in the profile's three-dot panel.
export default function AboutPanel() {
  const { user, logout } = useAuth()
  const { setChatOpen, toast } = useUi()

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xl font-bold">About <BrandName /></h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          <BrandName /> is a simple space for students to share thoughts and message each other, one-to-one.
        </p>
      </section>

      <section>
        <h3 className="font-bold">Credits</h3>
        <p className="text-sm text-neutral-500">The person behind everything we build.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {credits.map((c) => (
            <div key={c.name} className="card flex items-center gap-3 p-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-bold text-white">
                {c.name[0]}
              </span>
              <div>
                <p className="font-semibold">{c.name}</p>
                <p className="text-xs text-neutral-500">{c.role}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="font-bold">How <BrandName /> Works</h3>
        <p className="text-sm text-neutral-500">Simple. Reliable. Student focused.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.title} className="card p-4">
              <s.icon className="size-6 text-brand" />
              <h4 className="mt-2 text-sm font-semibold">{s.title}</h4>
              <p className="mt-1 text-xs text-neutral-500">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <h3 className="font-bold">Need help or have feedback?</h3>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Send us an email or chat with the admin team and we will get back to you.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a className="btn-outline" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('DHGRAM feedback')}`}>
            <Mail className="size-4" /> Email us
          </a>
          <button className="btn-primary" onClick={() => setChatOpen(true)}>
            <MessageCircle className="size-4" /> Chat with Admin
          </button>
        </div>
      </section>

      <section className="border-t border-neutral-200 pt-6 dark:border-neutral-800">
        {user ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-neutral-500">Signed in as</p>
              <p className="font-semibold">{user.name} <span className="text-sm font-normal text-neutral-500">@{user.username}</span></p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/account" className="btn-outline">My account</Link>
              {user.role === 'admin' && <Link to="/admin" className="btn-dark">Admin dashboard</Link>}
              <button
                className="btn-ghost"
                onClick={async () => {
                  await logout()
                  toast('Logged out')
                }}
              >
                <LogOut className="size-4" /> Logout
              </button>
            </div>
          </div>
        ) : (
          <AuthPanel />
        )}
      </section>
    </div>
  )
}
