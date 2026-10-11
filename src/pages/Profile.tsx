import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Camera, Check, MessageCircle, MoreVertical, Trash2 } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AboutPanel from '../components/AboutPanel'
import Avatar from '../components/Avatar'
import BrandName from '../components/BrandName'
import { Composer, PostCard } from '../components/PostCard'
import { EmptyState, ErrorState, Modal, PageSpinner, Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { api, errorMessage } from '../lib/api'
import { compressImage } from '../lib/image'
import type { MessageThread, Story, User } from '../lib/types'
import { usePageMeta } from '../lib/usePageMeta'
import { useMyStories, usePosts, useProfile } from '../lib/queries'

export default function Profile() {
  const { username } = useParams<{ username: string }>()
  const { user, setUser } = useAuth()
  const qc = useQueryClient()
  const { toast } = useUi()
  const navigate = useNavigate()

  const isMe = Boolean(user && (!username || username === user.username))
  const { data: profile, isLoading: profileLoading, error: profileError } = useProfile(isMe ? undefined : username)
  const viewUser = isMe ? user : profile

  usePageMeta(viewUser ? `${viewUser.name} (@${viewUser.username})` : 'Profile')

  const { data: posts, isLoading: postsLoading, error: postsError, refetch } = usePosts({ author: viewUser?._id, limit: 30 })
  const { data: myStories } = useMyStories(isMe)

  const [editing, setEditing] = useState(false)
  const [about, setAbout] = useState(false)
  const [form, setForm] = useState({ name: '', username: '' })
  const [menu, setMenu] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const openEditor = () => {
    if (user) setForm({ name: user.name, username: user.username })
    setEditing(true)
  }

  const startChat = useMutation({
    mutationFn: (userId: string) => api<{ data: { conversation: MessageThread } }>('/messages/start', { method: 'POST', body: { userId } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['messages'] })
      navigate(`/messages?c=${res.data.conversation._id}`)
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  })

  const saveProfile = async () => {
    setBusy(true)
    try {
      const res = await api<{ data: { user: User } }>('/auth/update-me', { method: 'PATCH', body: form })
      setUser(res.data.user)
      toast('Profile updated')
      setEditing(false)
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const changePic = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const avatar = await compressImage(file, 512, 0.85)
      const res = await api<{ data: { user: User } }>('/auth/update-me', { method: 'PATCH', body: { avatar } })
      setUser(res.data.user)
      toast('Profile picture updated')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const removePic = async () => {
    setBusy(true)
    try {
      const res = await api<{ data: { user: User } }>('/auth/update-me', { method: 'PATCH', body: { avatar: '' } })
      setUser(res.data.user)
      toast('Profile picture removed')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const removeStory = useMutation({
    mutationFn: (id: string) => api(`/stories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast('Story deleted')
      qc.invalidateQueries({ queryKey: ['stories'] })
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  })

  if (isMe && !user) return <EmptyState title="Log in to see your profile"><Link to="/login" className="btn-primary mt-2">Log in</Link></EmptyState>
  if (!isMe && profileLoading) return <PageSpinner />
  if (!isMe && (profileError || !viewUser)) return <ErrorState message={profileError?.message ?? 'Profile not found'} />
  if (!viewUser) return <PageSpinner />

  const thoughts = posts?.data.posts ?? []
  const stories: Story[] = myStories ?? []

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {!isMe && (
        <button className="btn-ghost -ml-3 mb-4" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-4" /> Back
        </button>
      )}

      <header className="flex items-start gap-5">
        <div className="relative shrink-0">
          <Avatar user={viewUser} size="xl" />
          {isMe && (
            <button
              className="absolute -bottom-1 -right-1 grid size-8 place-items-center rounded-full border-2 border-white bg-brand text-white dark:border-neutral-950"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              aria-label="Change profile picture"
            >
              {busy ? <Spinner className="size-4" /> : <Camera className="size-4" />}
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-extrabold">{viewUser.name}</h1>
              <p className="truncate text-sm text-neutral-500">@{viewUser.username}</p>
            </div>
            {isMe ? (
              <div className="flex shrink-0 items-center gap-2">
                <button className="btn-outline" onClick={openEditor}>Edit profile</button>
                <div className="relative">
                  <button className="btn-ghost p-2.5" onClick={() => setMenu((m) => !m)} aria-label="More options">
                    <MoreVertical className="size-4" />
                  </button>
                  {menu && (
                    <>
                      <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setMenu(false)} tabIndex={-1} />
                      <div className="card absolute right-0 z-20 mt-1 w-48 overflow-hidden p-1 text-sm">
                        <Link to="/account" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={() => setMenu(false)}>
                          Account settings
                        </Link>
                        <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={() => { setMenu(false); setAbout(true) }}>
                          About <BrandName />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <button className="btn-primary shrink-0" onClick={() => startChat.mutate(viewUser._id)} disabled={startChat.isPending}>
                {startChat.isPending ? <Spinner className="size-4" /> : <MessageCircle className="size-4" />} Message
              </button>
            )}
          </div>

          <div className="mt-4 flex gap-6 text-sm">
            <span><b className="font-bold">{thoughts.length}</b> <span className="text-neutral-500">thoughts</span></span>
            {isMe && stories.length > 0 && <span><b className="font-bold">{stories.length}</b> <span className="text-neutral-500">stories</span></span>}
          </div>
        </div>
      </header>

      {isMe && (
        <div className="mt-6 flex flex-wrap gap-2">
          <button className="btn-outline" onClick={openEditor}>Edit name & username</button>
          {viewUser.avatar && <button className="btn-ghost" onClick={removePic} disabled={busy}>Remove picture</button>}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={changePic} />
        </div>
      )}

      {isMe && stories.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">Your stories</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {stories.map((s) => (
              <div key={s._id} className="group relative size-24 shrink-0 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
                <img src={s.imageUrl} alt="" className="size-full object-cover" />
                <button
                  className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/50 text-white opacity-0 transition group-hover:opacity-100"
                  onClick={() => removeStory.mutate(s._id)}
                  aria-label="Delete story"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">{isMe ? 'Your thoughts' : 'Thoughts'}</h2>
        {isMe && (
          <div className="mb-4">
            <Composer onDone={() => refetch()} />
          </div>
        )}
        {postsLoading ? (
          <PageSpinner />
        ) : postsError ? (
          <ErrorState message={postsError.message} onRetry={() => refetch()} />
        ) : thoughts.length === 0 ? (
          <EmptyState title="No thoughts yet">{isMe ? 'Share your first thought above.' : 'Nothing shared yet.'}</EmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            {thoughts.map((p) => (
              <PostCard key={p._id} post={p} onChange={() => refetch()} />
            ))}
          </div>
        )}
      </section>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit profile">
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="pf-name">Name</label>
            <input id="pf-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="pf-username">Username</label>
            <input
              id="pf-username"
              className="input"
              value={form.username}
              pattern="[a-z0-9._]{3,30}"
              onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn-primary" onClick={saveProfile} disabled={busy || !form.name.trim()}>
              {busy ? <Spinner className="size-4" /> : <Check className="size-4" />} Save
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={about} onClose={() => setAbout(false)} title="About DHGRAM" wide>
        <AboutPanel auth />
      </Modal>
    </div>
  )
}
