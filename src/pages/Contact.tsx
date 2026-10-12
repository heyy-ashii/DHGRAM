import { MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { usePageMeta } from '../lib/usePageMeta'

export default function Contact() {
  usePageMeta('Contact', 'Questions or feedback? Reach the DHGRAM team from inside Messages.')
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-4xl font-extrabold tracking-tight">Contact Us</h1>
      <p className="mt-3 text-slate-600 dark:text-slate-400">Questions, feedback, or something not working? We&apos;d love to hear from you.</p>
      <div className="mx-auto mt-10 max-w-sm">
        <Link to="/messages" className="card block p-6 text-left transition hover:border-brand">
          <MessageCircle className="size-7 text-brand" />
          <p className="mt-3 font-semibold">Chat with the team</p>
          <p className="text-sm text-slate-500">Open Messages and pick Support to message the admin team directly.</p>
        </Link>
      </div>
    </div>
  )
}

