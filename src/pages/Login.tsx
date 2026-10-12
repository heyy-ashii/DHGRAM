import { useNavigate, useSearchParams } from 'react-router-dom'
import { Navigate } from 'react-router-dom'
import AuthPanel, { type AuthMode } from '../components/AuthPanel'
import { useAuth } from '../context/AuthContext'
import { usePageMeta } from '../lib/usePageMeta'

const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') ? n : null)

export default function Login({ initialMode = 'login' }: { initialMode?: AuthMode }) {
  usePageMeta(initialMode === 'signup' ? 'Create Account' : 'Login')
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))

  if (user) return <Navigate to={next ?? (user.role === 'admin' ? '/messages' : '/')} replace />

  return (
    <div className="px-4">
      <AuthPanel initialMode={initialMode} onSuccess={(u) => navigate(next ?? (u.role === 'admin' ? '/messages' : '/'), { replace: true })} />
    </div>
  )
}
