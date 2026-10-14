import { ArrowLeft, Eye, EyeOff, Info, Lock, MailCheck, ShieldCheck, Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { errorMessage } from '../lib/api'
import type { User } from '../lib/types'
import { cn } from '../lib/utils'
import BrandName from './BrandName'
import { Spinner } from './ui'

export type AuthMode = 'login' | 'forgot'

function PasswordInput({
  value,
  onChange,
  id,
  autoComplete,
}: {
  value: string
  onChange: (v: string) => void
  id: string
  autoComplete: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        id={id}
        className="input pr-11"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        minLength={8}
        required
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

const titles = { login: 'Welcome back', forgot: 'Reset password' }
const subtitles = {
  login: 'Log in with the username on your student account.',
  forgot: '',
}

export default function AuthPanel({
  initialMode = 'login',
  onSuccess,
  compact,
}: {
  initialMode?: AuthMode
  onSuccess?: (u: User) => void
  compact?: boolean
}) {
  const auth = useAuth()
  const { toast } = useUi()
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [form, setForm] = useState({
    identifier: '',
    password: '',
    email: '',
    code: '',
  })
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
    if (step === 'email') return sendCode()
    return run(async () =>
      done(await auth.resetPassword({ email: form.email, code: form.code, password: form.password }), 'Password updated'),
    )
  }

  const formCard = (
    <div className={cn('w-full', !compact && 'card p-6 shadow-lift sm:p-8')}>
      {mode === 'forgot' && (
        <button type="button" className="btn-ghost -ml-3 mb-2 px-3" onClick={() => switchMode('login')}>
          <ArrowLeft className="size-4" /> Back to login
        </button>
      )}

      <h2 className={cn('font-bold', compact ? 'text-lg' : 'text-[1.75rem]')}>{titles[mode]}</h2>
      <p className="mb-6 mt-1.5 text-sm text-ink-500">
        {mode === 'forgot'
          ? step === 'email'
            ? 'We will email you a code to reset your password.'
            : 'Enter the code and choose a new password.'
          : subtitles[mode]}
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        {mode === 'login' && (
          <>
            <div>
              <label className="label" htmlFor="identifier">Username or email</label>
              <input
                id="identifier"
                className="input"
                value={form.identifier}
                onChange={(e) => set('identifier')(e.target.value)}
                autoComplete="username"
                placeholder="e.g. jiyad.cp"
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="label" htmlFor="password">Password</label>
                <button type="button" className="mb-1.5 text-xs font-semibold text-brand hover:underline" onClick={() => switchMode('forgot')}>
                  Forgot password?
                </button>
              </div>
              <PasswordInput id="password" value={form.password} onChange={set('password')} autoComplete="current-password" />
            </div>
            <div className="flex items-start gap-2.5 rounded-2xl bg-brand-soft px-4 py-3 text-xs leading-relaxed text-brand-dark dark:bg-brand/10 dark:text-blue-200">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                Your account already exists. Your username is built from your name on the student list (e.g.{' '}
                <span className="font-semibold">jiyad.cp</span>). Logging in for the first time? Your password is your{' '}
                <span className="font-semibold">registration number followed by your admission number</span> — for
                example registration 250001 with admission 3411 gives <span className="font-semibold">2500013411</span>.
              </p>
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
                  <p className="flex items-start gap-2 rounded-2xl bg-brand-soft p-3 text-sm text-brand-dark dark:bg-brand/10 dark:text-blue-200">
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
                    <button type="button" className="text-ink-500 hover:text-ink-900 dark:hover:text-white" onClick={() => setStep('email')}>
                      Change email
                    </button>
                    <button type="button" className="font-semibold text-brand hover:underline disabled:opacity-50" onClick={sendCode} disabled={busy}>
                      Resend code
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="new-password">New password</label>
                  <PasswordInput id="new-password" value={form.password} onChange={set('password')} autoComplete="new-password" />
                  <p className="mt-1.5 text-xs text-ink-500">At least 8 characters.</p>
                </div>
              </>
            )}
          </>
        )}

        {error && (
          <p className="rounded-2xl bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary w-full py-3" disabled={busy}>
          {busy && <Spinner className="size-4" />}
          {mode === 'login' ? 'Login' : step === 'email' ? 'Send verification code' : 'Reset password'}
        </button>
      </form>
    </div>
  )

  if (compact) return formCard

  return (
    <div className="mx-auto grid w-full max-w-5xl items-stretch gap-8 px-4 py-10 lg:grid-cols-2 lg:py-16">
      {/* Marketing / brand side */}
      <div className="relative hidden flex-col justify-between overflow-hidden rounded-[2rem] bg-ink-900 p-10 text-white lg:flex dark:bg-ink-900">
        <div
          className="pointer-events-none absolute -right-16 -top-16 size-72 rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(circle, #2563eb, transparent 70%)' }}
        />
        <div
          className="pointer-events-none absolute -bottom-20 -left-10 size-72 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, #f97316, transparent 70%)' }}
        />
        <div className="relative">
          <span className="eyebrow text-blue-300">
            <Sparkles className="size-3.5" /> Share &amp; Message
          </span>
          <h1 className="mt-5 text-balance font-heading text-4xl font-bold leading-[1.08]">
            A quieter place to share what's on your mind.
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/70">
            Post thoughts, follow the community feed, and message other students one-to-one or in groups — all in one
            calm, focused space.
          </p>
        </div>

        <div className="relative space-y-3">
          {[
            { icon: Sparkles, text: 'Share thoughts & stories with your batch' },
            { icon: Lock, text: 'Private one-to-one and group messages' },
            { icon: ShieldCheck, text: 'Every student already has an account' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10">
                <Icon className="size-4" />
              </span>
              <span className="text-sm font-medium text-white/85">{text}</span>
            </div>
          ))}
        </div>

        <p className="relative text-xs text-white/50">
          <BrandName /> · for students
        </p>
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center">{formCard}</div>
    </div>
  )
}
