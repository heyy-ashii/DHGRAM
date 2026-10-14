import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, MessageCircle, MoreVertical, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AboutPanel from '../components/AboutPanel'
import Avatar from '../components/Avatar'
import BrandName from '../components/BrandName'
import { PostCard } from '../components/PostCard'
import { ReportButton } from '../components/ReportModal'
import { EmptyState, ErrorState, Modal, PageSpinner, Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { api, errorMessage } from '../lib/api'
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

  const [about, setAbout] = useState(false)
  const [menu, setMenu] = useState(false)

  const startChat = useMutation({
    mutationFn: (userId: string) => api<{ data: { conversation: MessageThread } }>('/messages/start', { method: 'POST', body: { userId } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['messages'] })
      navigate(`/messages?c=${res.data.conversation._id}`)
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  })

  const removePic = async () => {
    try {
      const res = await api<{ data: { user: User } }>('/auth/update-me', { method: 'PATCH', body: { avatar: '' } })
      setUser(res.data.user)
      toast('Profile picture removed')
    } catch (err) {
      toast(errorMessage(err), 'error')
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
    <div className="flex flex-col gap-7 px-5 py-6 md:px-10 md:py-10">
      {!isMe && (
        <button className="btn-ghost -ml-3 self-start px-3" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-4" /> Back
        </button>
      )}

      <header className="card flex flex-col gap-5 p-6">
        <div className="flex items-start gap-5">
          <Avatar user={viewUser} size="xl" className="shrink-0" />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate font-heading text-2xl font-semibold tracking-[-0.5px]">{viewUser.name}</h1>
                <p className="truncate text-sm text-ink-500">@{viewUser.username}</p>
              </div>
              {isMe ? (
                <div className="flex shrink-0 items-center gap-2">
                  <Link className="btn-outline" to="/account">Edit profile</Link>
                  <div className="relative">
                    <button className="grid size-11 place-items-center rounded-[10px] text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800" onClick={() => setMenu((m) => !m)} aria-label="More options">
                      <MoreVertical className="size-5" />
                    </button>
                    {menu && (
                      <>
                        <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setMenu(false)} tabIndex={-1} />
                        <div className="card absolute right-0 z-20 mt-1 w-48 overflow-hidden p-1.5 text-sm shadow-lift">
                          <Link to="/account" className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 hover:bg-ink-100 dark:hover:bg-ink-800" onClick={() => setMenu(false)}>
                            Account settings
                          </Link>
                          <button className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left hover:bg-ink-100 dark:hover:bg-ink-800" onClick={() => { setMenu(false); setAbout(true) }}>
                            About <BrandName />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex shrink-0 items-center gap-2">
                  <button className="btn-primary shrink-0" onClick={() => startChat.mutate(viewUser._id)} disabled={startChat.isPending}>
                    {startChat.isPending ? <Spinner className="size-4" /> : <MessageCircle className="size-4" />} Message
                  </button>
                  <ReportButton kind="user" targetId={viewUser._id} label="" className="grid size-11 place-items-center rounded-[10px] px-0" icon={<MoreVertical className="size-5" />} />
                </div>
              )}
            </div>

            <div className="mt-4 flex gap-6 text-sm">
              <span><b className="font-bold">{thoughts.length}</b> <span className="text-ink-500">thoughts</span></span>
              {isMe && stories.length > 0 && <span><b className="font-bold">{stories.length}</b> <span className="text-ink-500">stories</span></span>}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-ink-400">Thoughts shown from the latest fetched posts.</p>
          {isMe && viewUser.avatar && (
            <button className="text-[11px] font-semibold text-ink-400 hover:text-red-600" onClick={removePic}>Remove picture</button>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-7 lg:flex-row">
        <section className="flex min-w-0 flex-1 flex-col gap-4">
          <h2 className="text-[13px] font-bold">{isMe ? 'Your thoughts' : 'Thoughts'}</h2>
          {postsLoading ? (
            <PageSpinner />
          ) : postsError ? (
            <ErrorState message={postsError.message} onRetry={() => refetch()} />
          ) : thoughts.length === 0 ? (
            <EmptyState title="No thoughts yet">Nothing shared yet.</EmptyState>
          ) : (
            <div className="flex flex-col gap-4">
              {thoughts.map((p) => (
                <PostCard key={p._id} post={p} onChange={() => refetch()} />
              ))}
            </div>
          )}
        </section>

        {isMe && stories.length > 0 && (
          <aside className="w-full lg:w-[300px] lg:shrink-0">
            <div className="card flex flex-col gap-4 p-6">
              <h2 className="text-[13px] font-bold">Your stories</h2>
              <div className="flex flex-wrap gap-3">
                {stories.map((s) => (
                  <div key={s._id} className="group relative size-24 shrink-0 overflow-hidden rounded-[10px] border border-ink-200 dark:border-ink-800">
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
            </div>
          </aside>
        )}
      </div>

      <Modal open={about} onClose={() => setAbout(false)} title="About DHGRAM" wide>
        <AboutPanel auth />
      </Modal>
    </div>
  )
}
