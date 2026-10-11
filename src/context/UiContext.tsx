import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark'
type Toast = { id: number; message: string; tone: 'success' | 'error' }

interface UiValue {
  theme: Theme
  toggleTheme: () => void
  toasts: Toast[]
  toast: (message: string, tone?: Toast['tone']) => void
}

const UiContext = createContext<UiValue | null>(null)

export function UiProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem('dhgram-theme', theme)
    } catch {
      /* storage unavailable */
    }
  }, [theme])

  const toast = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])

  const value = useMemo(
    () => ({
      theme,
      toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
      toasts,
      toast,
    }),
    [theme, toasts, toast],
  )

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUi() {
  const ctx = useContext(UiContext)
  if (!ctx) throw new Error('useUi must be used inside UiProvider')
  return ctx
}
