import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import AuthPanel from '../components/AuthPanel'
import { useAuth } from '../context/AuthContext'
import { usePageMeta } from '../lib/usePageMeta'

const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') ? n : null)

export default function Login() {
  usePageMeta('Log in')
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))

  if (user) return <Navigate to={next ?? (user.role === 'admin' ? '/messages' : '/')} replace />

  return <AuthPanel onSuccess={(u) => navigate(next ?? (u.role === 'admin' ? '/messages' : '/'), { replace: true })} />
}
