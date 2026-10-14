import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { api, ApiError } from '../lib/api'
import type { User } from '../lib/types'

type AuthResponse = { data: { user: User } }

interface AuthValue {
  user: User | null
  loading: boolean
  isAdmin: boolean
  login: (identifier: string, password: string) => Promise<User>
  requestResetCode: (email: string) => Promise<{ message: string; devCode?: string }>
  resetPassword: (input: { email: string; code: string; password: string }) => Promise<User>
  logout: () => Promise<void>
  setUser: (user: User | null) => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const { data: user = null, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api<AuthResponse>('/auth/me')).data.user
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null
        throw err
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  })

  const setUser = useCallback((u: User | null) => qc.setQueryData(['me'], u), [qc])

  const value = useMemo<AuthValue>(() => {
    const authed = async (path: string, body: unknown) => {
      const u = (await api<AuthResponse>(path, { method: 'POST', body })).data.user
      setUser(u)
      return u
    }
    return {
      user,
      loading: isLoading,
      isAdmin: user?.role === 'admin',
      setUser,
      login: (identifier, password) => authed('/auth/login', { identifier, password }),
      requestResetCode: (email) => api('/auth/password/request-otp', { method: 'POST', body: { email } }),
      resetPassword: (input) => authed('/auth/password/reset', input),
      logout: async () => {
        await api('/auth/logout', { method: 'POST' })
        setUser(null)
        qc.removeQueries({ queryKey: ['chat'] })
      },
    }
  }, [user, isLoading, setUser, qc])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
