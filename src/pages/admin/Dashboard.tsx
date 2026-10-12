import { Flag, MessageCircle, PenLine, ShieldCheck, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageSpinner } from '../../components/ui'
import { usePageMeta } from '../../lib/usePageMeta'
import { useStats } from '../../lib/queries'

export default function Dashboard() {
  usePageMeta('Admin Dashboard')
  const { data, isLoading } = useStats()
  if (isLoading || !data) return <PageSpinner />
  const cards = [
    { label: 'Users', value: data.users, sub: `${data.disabled} disabled · ${data.suspended} suspended`, icon: Users, to: '/admin/users' },
    { label: 'Reports', value: data.openReports, sub: 'awaiting review', icon: Flag, to: '/admin/reports' },
    { label: 'Admins', value: data.admins, sub: 'with full access', icon: ShieldCheck, to: '/admin/users?role=admin' },
    { label: 'Open chats', value: data.openChats, sub: `${data.unreadMessages} unread messages`, icon: MessageCircle, to: '/messages' },
  ]
  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="card p-5 transition hover:border-brand">
            <c.icon className="size-6 text-brand" />
            <p className="mt-4 text-3xl font-extrabold">{c.value}</p>
            <p className="font-medium">{c.label}</p>
            <p className="text-sm text-ink-500">{c.sub}</p>
          </Link>
        ))}
      </div>

      <h2 className="mt-8 text-lg font-bold">Moderation</h2>
      <p className="text-sm text-ink-500">Review what students have flagged, and act on the account or content behind it.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Link to="/admin/reports" className="card flex items-start gap-3 p-5 transition hover:border-brand">
          <Flag className="mt-0.5 size-5 text-brand" />
          <div>
            <p className="font-semibold">Reports queue</p>
            <p className="text-sm text-ink-500">{data.openReports} open report{data.openReports === 1 ? '' : 's'} to triage</p>
          </div>
        </Link>
        <Link to="/admin/thoughts" className="card flex items-start gap-3 p-5 transition hover:border-brand">
          <PenLine className="mt-0.5 size-5 text-brand" />
          <div>
            <p className="font-semibold">Thoughts</p>
            <p className="text-sm text-ink-500">Hide or delete reported thoughts</p>
          </div>
        </Link>
        <Link to="/admin/users" className="card flex items-start gap-3 p-5 transition hover:border-brand">
          <Users className="mt-0.5 size-5 text-brand" />
          <div>
            <p className="font-semibold">Accounts</p>
            <p className="text-sm text-ink-500">Suspend for a set time or disable</p>
          </div>
        </Link>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/admin/reports" className="btn-primary">Review reports</Link>
        <Link to="/admin/thoughts" className="btn-outline">Moderate thoughts</Link>
        <Link to="/admin/users" className="btn-outline">Manage users</Link>
        <Link to="/messages" className="btn-outline">Open inbox</Link>
      </div>
    </div>
  )
}
