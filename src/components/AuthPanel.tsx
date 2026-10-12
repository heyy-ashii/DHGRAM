import { ArrowLeft, Eye, EyeOff, MailCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { errorMessage } from '../lib/api'
import type { User } from '../lib/types'
import { cn } from '../lib/utils'
import { Spinner } from './ui'

export type AuthMode = 'login' | 'signup' | 'forgot'

function PasswordInput({ value, onChange, id, autoComplete }: { value: string; onChange: (v: string) => void; id: string; autoComplete: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        id={id}
        className="input pr-10"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        minLength={8}
        required
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

export default function AuthPanel({ initialMode = 'login', onSuccess, compact }: { initialMode?: AuthMode; onSuccess?: (u: User) => void; compact?: boolean }) {
  const auth = useAuth()
  const { toast } = useUi()
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [form, setForm] = useState({ identifier: '', password: '', email: '', code: '', name: '', username: '', admissionNo: '' })
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  const switchMode = (m: AuthMode) => {
    setMode(m)
    setStep('email')
    setError('')
    setInfo('')
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const done = (u: User, msg: string) => {
    toast(msg)
    onSuccess?.(u)
  }

  const sendCode = () =>
    run(async () => {
      const res = await auth.requestResetCode(form.email)
      setStep('code')
      setInfo(res.devCode ? `${res.message} (dev code: ${res.devCode})` : res.message)
    })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (mode === 'login') return run(async () => done(await auth.login(form.identifier, form.password), 'Welcome back!'))
    if (mode === 'signup')
      return run(async () => done(await auth.signup({ name: form.name, admissionNo: form.admissionNo }), 'Account created. Welcome to DHGRAM!'))
    if (step === 'email') return sendCode()
    return run(async () => done(await auth.resetPassword({ email: form.email, code: form.code, password: form.password }), 'Password updated'))
  }

  const titles = { login: 'Welcome back', signup: 'Create your account', forgot: 'Reset password' }

  return (
    <div className={cn(!compact && 'card p-6 sm:p-8')}>
      {mode !== 'forgot' && (
        <div className="mb-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="tablist">
          {(['login', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchMode(m)}
              className={cn('rounded-lg py-2 text-sm font-semibold transition', mode === m ? 'bg-white shadow-sm dark:bg-slate-950' : 'text-slate-500')}
            >
              {m === 'login' ? 'Login' : 'Create Account'}
            </button>
          ))}
        </div>
      )}

      {mode === 'forgot' && (
        <button type="button" className="btn-ghost -ml-3 mb-2 px-3" onClick={() => switchMode('login')}>
          <ArrowLeft className="size-4" /> Back to login
        </button>
      )}
      <h2 className={cn('font-bold', compact ? 'text-lg' : 'text-2xl')}>{titles[mode]}</h2>
      <p className="mb-5 mt-1 text-sm text-slate-500">
        {mode === 'login' && 'Log in with your username or email.'}
        {mode === 'signup' && 'Use the name and admission number on the student list.'}
        {mode === 'forgot' && (step === 'email' ? 'We will email you a code to reset your password.' : 'Enter the code and choose a new password.')}
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        {mode === 'login' && (
          <>
            <div>
              <label className="label" htmlFor="identifier">Username or email</label>
              <input id="identifier" className="input" value={form.identifier} onChange={(e) => set('identifier')(e.target.value)} autoComplete="username" required />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="label" htmlFor="password">Password</label>
                <button type="button" className="mb-1.5 text-xs font-medium text-brand hover:underline" onClick={() => switchMode('forgot')}>
                  Forgot password?
                </button>
              </div>
              <PasswordInput id="password" value={form.password} onChange={set('password')} autoComplete="current-password" />
            </div>
          </>
        )}

        {mode === 'signup' && (
          <>
            <div>
              <label className="label" htmlFor="name">Full name</label>
              <input
                id="name"
                className="input"
                value={form.name}
                onChange={(e) => set('name')(e.target.value)}
                autoComplete="name"
                placeholder="As it appears on the student list"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="admissionNo">Admission number</label>
              <input
                id="admissionNo"
                className="input"
                value={form.admissionNo}
                onChange={(e) => set('admissionNo')(e.target.value)}
                placeholder="e.g. 3411"
                required
              />
              <p className="mt-1 text-xs text-slate-500">Your admission number is your initial password. Change it after your first login.</p>
            </div>
          </>
        )}

        {mode === 'forgot' && (
          <>
            <div>
              <label className="label" htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                className="input"
                value={form.email}
                onChange={(e) => set('email')(e.target.value)}
                autoComplete="email"
                disabled={step === 'code'}
                required
              />
            </div>
            {step === 'code' && (
              <>
                {info && (
                  <p className="flex items-start gap-2 rounded-xl bg-brand-soft p-3 text-sm text-indigo-800 dark:bg-brand/15 dark:text-indigo-200">
                    <MailCheck className="mt-0.5 size-4 shrink-0" /> {info}
                  </p>
                )}
                <div>
                  <label className="label" htmlFor="code">Verification code</label>
                  <input
                    id="code"
                    className="input text-center text-lg tracking-[0.5em]"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    pattern="\d{6}"
                    value={form.code}
                    onChange={(e) => set('code')(e.target.value.replace(/\D/g, ''))}
                    required
                  />
                  <div className="mt-1.5 flex justify-between text-xs">
                    <button type="button" className="text-slate-500 hover:text-slate-900 dark:hover:text-white" onClick={() => setStep('email')}>
                      Change email
                    </button>
                    <button type="button" className="font-medium text-brand hover:underline disabled:opacity-50" onClick={sendCode} disabled={busy}>
                      Resend code
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="new-password">New password</label>
                  <PasswordInput id="new-password" value={form.password} onChange={set('password')} autoComplete="new-password" />
                  <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
                </div>
              </>
            )}
          </>
        )}

        {error && (
          <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy && <Spinner className="size-4" />}
          {mode === 'login' ? 'Login' : mode === 'signup' ? 'Create account' : step === 'email' ? 'Send verification code' : 'Reset password'}
        </button>
      </form>
    </div>
  )
}
