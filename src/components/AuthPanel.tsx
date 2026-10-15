import { ArrowLeft, Eye, EyeOff, Info, MailCheck, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { errorMessage } from '../lib/api'
import type { User } from '../lib/types'
import { cn } from '../lib/utils'
import BrandName from './BrandName'
import Logo from './Logo'
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
        className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-[10px] text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

const titles = { login: 'Welcome back.', forgot: 'Reset password.' }
const subtitles = { login: 'Your community is right here.', forgot: '' }

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
    <div className={cn('w-full', !compact && 'max-w-[480px]')}>
      {mode === 'forgot' && (
        <button type="button" className="btn-ghost -ml-3 mb-2 px-3" onClick={() => switchMode('login')}>
          <ArrowLeft className="size-4" /> Back to login
        </button>
      )}

      <h2 className={cn('font-heading font-semibold tracking-[-0.5px]', compact ? 'text-2xl' : 'text-[32px] leading-[37px]')}>
        {titles[mode]}
      </h2>
      <p className="mb-6 mt-2.5 text-sm text-ink-500">
        {mode === 'forgot'
          ? step === 'email'
            ? 'We will email you a code to reset your password.'
            : 'Enter the code and choose a new password.'
          : subtitles[mode]}
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        {mode === 'login' && (
          <>
            <div>
              <label className="label" htmlFor="identifier">Username or registration number</label>
              <input
                id="identifier"
                className="input"
                value={form.identifier}
                onChange={(e) => set('identifier')(e.target.value)}
                autoComplete="username"
                placeholder="Username or registration number"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <PasswordInput id="password" value={form.password} onChange={set('password')} autoComplete="current-password" />
            </div>
            <div className="flex justify-end">
              <button type="button" className="text-[13px] font-bold text-brand hover:underline" onClick={() => switchMode('forgot')}>
                Forgot password?
              </button>
            </div>
            <div className="flex items-start gap-2.5 rounded-[10px] bg-brand-soft px-4 py-3 text-xs leading-relaxed text-brand-dark dark:bg-brand/10 dark:text-blue-200">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                Your account already exists. Your username is built from your name on the student list. Logging in for
                the first time? Your password is your registration number followed by your admission number.
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
                  <p className="flex items-start gap-2 rounded-[10px] bg-brand-soft p-3 text-sm text-brand-dark dark:bg-brand/10 dark:text-blue-200">
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
          <p className="rounded-[10px] bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy && <Spinner className="size-4" />}
          {mode === 'login' ? 'Log in' : step === 'email' ? 'Send verification code' : 'Reset password'}
        </button>
      </form>

      {mode === 'login' && (
        <>
          <div className="my-6 h-px bg-ink-200 dark:bg-ink-800" />
          <p className="text-[13px] text-ink-500">
            Every student on the roster already has an account — no sign-up needed.
          </p>
        </>
      )}
    </div>
  )

  if (compact) return formCard

  return (
    <div className="grid min-h-screen w-full lg:grid-cols-[minmax(0,600px)_1fr]">
      {/* Community introduction, from the handoff. */}
      <div className="hidden flex-col justify-between bg-ink-50 px-16 py-12 lg:flex dark:bg-ink-950/50">
        <Logo withText={false} className="h-[105px]" />
        <div className="flex flex-col gap-6">
          <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-500">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden /> The student community
          </span>
          <h1 className="font-heading text-[50px] font-semibold leading-[58px] tracking-[-0.5px]">
            Share thoughts.<br />Message students.
          </h1>
          <p className="max-w-[472px] text-base leading-[25px] text-ink-500">
            For the ideas between classes, the small wins, and the people who make campus feel like home.
          </p>
          <figure className="flex flex-col gap-5 rounded-[20px] border border-ink-200 bg-white p-6 dark:border-ink-800 dark:bg-ink-900">
            <blockquote className="font-heading text-2xl font-semibold leading-7 tracking-[-0.5px]">
              "Some of the best things I've learned weren't on the syllabus."
            </blockquote>
            <figcaption className="flex items-center gap-2.5 text-xs text-ink-500">
              <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-brand to-accent text-xs font-bold text-white">J</span>
              Jiyad CP · @jiyad.cp
            </figcaption>
          </figure>
        </div>
        <p className="text-[11px] text-ink-400">
          <BrandName /> · Made by Ashique.Pilassery
        </p>
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center px-6 py-16">
        <div className="flex w-full max-w-[480px] flex-col">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Logo />
          </div>
          {formCard}
          <p className="mt-8 flex items-center gap-2 text-xs text-ink-400">
            <ShieldCheck className="size-4" /> Your account is created from the official student roster.
          </p>
        </div>
      </div>
    </div>
  )
}
