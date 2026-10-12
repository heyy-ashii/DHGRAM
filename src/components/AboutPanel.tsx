import { Code2, LogOut, MessageSquare, Timer, Users } from 'lucide-react'
import AuthPanel from './AuthPanel'
import BrandName from './BrandName'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { CREATOR_NAME } from '../lib/utils'

const credits = [{ name: CREATOR_NAME, role: 'Founder · Design & Full-stack Development', icon: Code2 }]

const steps = [
  { icon: MessageSquare, title: 'Share thoughts', text: 'Any signed-in student can post a thought to the public feed.' },
  { icon: Users, title: 'Chat with anyone', text: 'Message another student one-to-one, or start a group with several.' },
  { icon: Timer, title: 'Stays fresh', text: 'Messages clear automatically after 30 days, so nothing piles up.' },
]

// The About content. Rendered on the public /about page and in the profile's
// three-dot panel. The profile passes `auth` so its panel can offer log in/out;
// the public page leaves it off and shows the explanation on its own.
export default function AboutPanel({ auth = false }: { auth?: boolean }) {
  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm text-ink-600 dark:text-ink-400">
          <BrandName /> is a simple space for students to share thoughts and message each other — one-to-one or in groups.
        </p>
      </section>

      <section>
        <h3 className="font-bold">Credits</h3>
        <p className="text-sm text-ink-500">The person behind everything we build.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {credits.map((c) => (
            <div key={c.name} className="card flex items-center gap-3 p-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-bold text-white">
                {c.name[0]}
              </span>
              <div>
                <p className="font-semibold">{c.name}</p>
                <p className="text-xs text-ink-500">{c.role}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="font-bold">How <BrandName /> Works</h3>
        <p className="text-sm text-ink-500">Simple. Reliable. Student focused.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.title} className="card p-4">
              <s.icon className="size-6 text-brand" />
              <h4 className="mt-2 text-sm font-semibold">{s.title}</h4>
              <p className="mt-1 text-xs text-ink-500">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {auth && (
        <section className="border-t border-ink-200 pt-6 dark:border-ink-800">
          <AuthSection />
        </section>
      )}
    </div>
  )
}

function AuthSection() {
  const { user, logout } = useAuth()
  const { toast } = useUi()

  if (!user)
    return (
      <div>
        <h3 className="font-bold">Log in</h3>
        <p className="mb-4 text-sm text-ink-500">Log in to share thoughts and message other students.</p>
        <AuthPanel />
      </div>
    )

  return (
    <div>
      <h3 className="font-bold">Your account</h3>
      <p className="mb-4 text-sm text-ink-500">You are signed in as {user.name} (@{user.username}).</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-ghost text-red-600 hover:bg-red-50 dark:hover:bg-red-950" onClick={async () => { await logout(); toast('Signed out') }}>
          <LogOut className="size-4" /> Log out
        </button>
      </div>
    </div>
  )
}
