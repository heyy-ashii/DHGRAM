import { MessageCircle, ShieldCheck, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageSpinner } from '../../components/ui'
import { usePageMeta } from '../../lib/usePageMeta'
import { useStats } from '../../lib/queries'

export default function Dashboard() {
  usePageMeta('Admin Dashboard')
  const { data, isLoading } = useStats()
  if (isLoading || !data) return <PageSpinner />
  const cards = [
    { label: 'Users', value: data.users, sub: `${data.disabled} disabled`, icon: Users, to: '/admin/users' },
    { label: 'Admins', value: data.admins, sub: 'with full access', icon: ShieldCheck, to: '/admin/users?role=admin' },
    { label: 'Open chats', value: data.openChats, sub: `${data.unreadMessages} unread messages`, icon: MessageCircle, to: '/messages' },
  ]
  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="card p-5 transition hover:border-brand">
            <c.icon className="size-6 text-brand" />
            <p className="mt-4 text-3xl font-extrabold">{c.value}</p>
            <p className="font-medium">{c.label}</p>
            <p className="text-sm text-ink-500">{c.sub}</p>
          </Link>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/admin/users?new=1" className="btn-primary">Add user</Link>
        <Link to="/messages" className="btn-outline">Open inbox</Link>
      </div>
    </div>
  )
}
