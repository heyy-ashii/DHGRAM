import { Camera, LogOut } from 'lucide-react'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import Avatar from '../components/Avatar'
import { Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { api, errorMessage } from '../lib/api'
import { compressImage } from '../lib/image'
import type { User } from '../lib/types'
import { usePageMeta } from '../lib/usePageMeta'

export default function Account() {
  usePageMeta('Edit profile')
  const { user, setUser, logout } = useAuth()
  const { toast } = useUi()
  const navigate = useNavigate()
  const [profile, setProfile] = useState({ name: user!.name, username: user!.username })
  const [pw, setPw] = useState({ currentPassword: '', password: '' })
  const [busy, setBusy] = useState<'' | 'profile' | 'password' | 'avatar'>('')
  const fileRef = useRef<HTMLInputElement>(null)

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault()
    setBusy('profile')
    try {
      const res = await api<{ data: { user: User } }>('/auth/update-me', { method: 'PATCH', body: profile })
      setUser(res.data.user)
      toast('Profile updated')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy('')
    }
  }

  const changePic = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy('avatar')
    try {
      const avatar = await compressImage(file, 512, 0.85)
      const res = await api<{ data: { user: User } }>('/auth/update-me', { method: 'PATCH', body: { avatar } })
      setUser(res.data.user)
      toast('Profile picture updated')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy('')
    }
  }

  const removePic = async () => {
    setBusy('avatar')
    try {
      const res = await api<{ data: { user: User } }>('/auth/update-me', { method: 'PATCH', body: { avatar: '' } })
      setUser(res.data.user)
      toast('Profile picture removed')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy('')
    }
  }

  const savePassword = async (e: FormEvent) => {
    e.preventDefault()
    setBusy('password')
    try {
      const res = await api<{ data: { user: User } }>('/auth/update-password', { method: 'PATCH', body: pw })
      setUser(res.data.user)
      setPw({ currentPassword: '', password: '' })
      toast('Password changed')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Edit profile</h1>
          <p className="text-sm text-ink-500">{user!.email ?? `@${user!.username}`}</p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-ghost"
            onClick={async () => {
              await logout()
              toast('Logged out')
              navigate('/')
            }}
          >
            <LogOut className="size-4" /> Logout
          </button>
        </div>
      </div>

      <form onSubmit={saveProfile} className="card mt-8 space-y-4 p-6">
        <h2 className="font-bold">Profile</h2>
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <Avatar user={user!} size="xl" />
            <button
              type="button"
              className="absolute -bottom-1 -right-1 grid size-8 place-items-center rounded-full border-2 border-white bg-brand text-white dark:border-ink-950"
              onClick={() => fileRef.current?.click()}
              disabled={busy === 'avatar'}
              aria-label="Change profile picture"
            >
              {busy === 'avatar' ? <Spinner className="size-4" /> : <Camera className="size-4" />}
            </button>
          </div>
          <div className="text-sm">
            <p className="font-medium">Profile picture</p>
            <div className="mt-1 flex gap-3">
              <button type="button" className="text-brand hover:underline" onClick={() => fileRef.current?.click()} disabled={busy === 'avatar'}>
                Upload a new photo
              </button>
              {user!.avatar && (
                <button type="button" className="text-ink-500 hover:underline" onClick={removePic} disabled={busy === 'avatar'}>
                  Remove
                </button>
              )}
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={changePic} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="acc-name">Name</label>
            <input id="acc-name" className="input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} required />
          </div>
          <div>
            <label className="label" htmlFor="acc-username">Username</label>
            <input id="acc-username" className="input" value={profile.username} pattern="[a-z0-9._]{3,30}" onChange={(e) => setProfile({ ...profile, username: e.target.value.toLowerCase() })} required />
          </div>
        </div>
        <button className="btn-primary" disabled={busy === 'profile'}>{busy === 'profile' && <Spinner className="size-4" />} Save profile</button>
      </form>

      <form onSubmit={savePassword} className="card mt-6 space-y-4 p-6">
        <h2 className="font-bold">Change password</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="acc-current">Current password</label>
            <input id="acc-current" type="password" className="input" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required />
          </div>
          <div>
            <label className="label" htmlFor="acc-new">New password</label>
            <input id="acc-new" type="password" className="input" autoComplete="new-password" minLength={8} value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} required />
          </div>
        </div>
        <button className="btn-primary" disabled={busy === 'password'}>{busy === 'password' && <Spinner className="size-4" />} Update password</button>
      </form>
    </div>
  )
}
