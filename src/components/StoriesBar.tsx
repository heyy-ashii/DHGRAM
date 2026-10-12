import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import Avatar from './Avatar'
import { Spinner } from './ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { api, errorMessage } from '../lib/api'
import { compressImage } from '../lib/image'
import type { StoryGroup } from '../lib/types'
import { cn, formatShort } from '../lib/utils'

type Item = { user: StoryGroup['user']; story: StoryGroup['stories'][number] }

// Flattens groups into a single ordered list so the viewer can walk every story
// continuously, the way Instagram does.
function flatten(groups: StoryGroup[]): Item[] {
  return groups.flatMap((g) => g.stories.map((story) => ({ user: g.user, story })))
}

// Full-screen review step shown after a photo is picked and before it is posted.
// The author sees exactly what viewers will see - image, caption, author and
// timestamp - and can go back to choose a different photo or add a caption.
function StoryComposer({ imageUrl, user, onCancel, onPosted }: {
  imageUrl: string
  user: StoryGroup['user']
  onCancel: () => void
  onPosted: () => void
}) {
  const qc = useQueryClient()
  const { toast } = useUi()
  const [caption, setCaption] = useState('')

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKey)
    }
  }, [onCancel])

  const post = useMutation({
    mutationFn: () => api('/stories', { method: 'POST', body: { imageUrl, caption: caption.trim() } }),
    onSuccess: () => {
      toast('Story posted')
      qc.invalidateQueries({ queryKey: ['stories'] })
      onPosted()
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  })

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-ink-950/95 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Preview story">
      <header className="flex items-center justify-between gap-3 p-4 text-white">
        <button className="rounded-full p-2 text-white/80 hover:bg-white/10" onClick={onCancel} aria-label="Discard preview">
          <X className="size-5" />
        </button>
        <p className="text-sm font-semibold">Preview</p>
        <button
          className="btn-primary px-4 py-2"
          onClick={() => post.mutate()}
          disabled={post.isPending}
        >
          {post.isPending ? <Spinner className="size-4" /> : null} Post story
        </button>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center px-3">
        <div className="relative flex max-h-full flex-col items-center">
          <img src={imageUrl} alt="" className="max-h-[70vh] max-w-full rounded-2xl object-contain" />
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-3 p-4">
            <Avatar user={user} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white drop-shadow">{user.name || 'Student'}</p>
              <p className="truncate text-xs text-white/70">Just now</p>
            </div>
          </div>
          {caption.trim() && (
            <p className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-2xl bg-gradient-to-t from-black/70 to-transparent p-4 pb-3 text-sm text-white">
              {caption.trim()}
            </p>
          )}
        </div>
      </div>

      <div className="p-4">
        <label className="sr-only" htmlFor="story-caption">Caption</label>
        <input
          id="story-caption"
          className="input bg-white/10 text-white placeholder:text-white/50 focus:border-white/40 focus:ring-white/20"
          placeholder="Add a caption… (optional)"
          value={caption}
          maxLength={280}
          onChange={(e) => setCaption(e.target.value)}
        />
        <p className="mt-2 text-center text-xs text-white/50">This is how your story will appear. It disappears after 24 hours.</p>
      </div>
    </div>
  )
}

function StoryViewer({ items, startIndex, onClose }: { items: Item[]; startIndex: number; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useUi()
  const { isAdmin } = useAuth()
  const [index, setIndex] = useState(startIndex)
  const viewed = useRef(new Set<string>())
  const current = items[index]

  useEffect(() => {
    if (!current) return
    if (viewed.current.has(current.story._id)) return
    viewed.current.add(current.story._id)
    if (current.story.mine) return
    api(`/stories/${current.story._id}/view`, { method: 'POST' })
      .then(() => qc.invalidateQueries({ queryKey: ['stories', 'feed'] }))
      .catch(() => {})
  }, [current, qc])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(items.length - 1, i + 1))
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [items.length, onClose])

  const remove = useMutation({
    mutationFn: (id: string) => api(`/stories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast('Story deleted')
      qc.invalidateQueries({ queryKey: ['stories'] })
      onClose()
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  })

  if (!current) return null
  const canDelete = current.story.mine || isAdmin

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/95" role="dialog" aria-modal="true" aria-label="Story">
      <div className="flex items-center gap-3 p-4 text-white">
        <Avatar user={current.user} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{current.user.name || 'Student'}</p>
          <p className="truncate text-xs text-white/60">{formatShort(current.story.createdAt)}</p>
        </div>
        {canDelete && (
          <button
            className="rounded-full p-2 text-white/80 hover:bg-white/10"
            onClick={() => remove.mutate(current.story._id)}
            aria-label="Delete story"
          >
            {remove.isPending ? <Spinner className="size-5" /> : <Trash2 className="size-5" />}
          </button>
        )}
        <button className="rounded-full p-2 text-white/80 hover:bg-white/10" onClick={onClose} aria-label="Close">
          <X className="size-5" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4">
        <button
          className="absolute left-1 z-10 rounded-full bg-black/40 p-2 text-white disabled:opacity-20 sm:left-4"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          aria-label="Previous story"
        >
          <ChevronLeft className="size-6" />
        </button>
        <div className="relative flex max-h-full flex-col items-center">
          <img src={current.story.imageUrl} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
          {current.story.caption && (
            <p className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-xl bg-gradient-to-t from-black/70 to-transparent p-4 pb-3 text-sm text-white">
              {current.story.caption}
            </p>
          )}
        </div>
        <button
          className="absolute right-1 z-10 rounded-full bg-black/40 p-2 text-white disabled:opacity-20 sm:right-4"
          onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
          disabled={index === items.length - 1}
          aria-label="Next story"
        >
          <ChevronRight className="size-6" />
        </button>
      </div>
    </div>
  )
}

function Ring({ unseen, children }: { unseen: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        'grid size-[68px] place-items-center rounded-full p-[3px]',
        unseen
          ? 'bg-[conic-gradient(from_140deg,#f9ce34,#ee2a7b,#6228d7,#f9ce34)]'
          : 'bg-ink-200 dark:bg-ink-700',
      )}
    >
      <span className="grid size-full place-items-center rounded-full bg-ink-50 p-[2px] dark:bg-ink-950">{children}</span>
    </span>
  )
}

export default function StoriesBar({ groups }: { groups: StoryGroup[] }) {
  const { toast } = useUi()
  const { user } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [openAt, setOpenAt] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)

  const items = flatten(groups)
  const mineIndex = items.findIndex((i) => i.story.mine)
  const myGroup = groups.find((g) => String(g.user._id) === String(user?._id))

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      // Compress, then hand the result to the preview step instead of posting.
      setDraft(await compressImage(file, 1080, 0.8))
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-b border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
      <div className="no-scrollbar flex gap-4 overflow-x-auto px-4 py-4">
        {user && (
          <div className="flex w-16 shrink-0 flex-col items-center gap-1.5">
            <button
              className="relative"
              onClick={() => (mineIndex >= 0 ? setOpenAt(mineIndex) : fileRef.current?.click())}
              aria-label={mineIndex >= 0 ? 'View your story' : 'Add a story'}
            >
              <Ring unseen={Boolean(myGroup?.unseen)}>
                <Avatar user={user} size="lg" />
              </Ring>
              <span className="absolute -bottom-0.5 -right-0.5 grid size-6 place-items-center rounded-full border-2 border-white bg-brand text-white dark:border-ink-900">
                {busy ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" />}
              </span>
            </button>
            <span className="w-full truncate text-center text-[11px] font-medium">Your story</span>
          </div>
        )}

        {groups.map((g) => {
          if (String(g.user._id) === String(user?._id)) return null
          const start = items.findIndex((i) => i.story._id === g.stories[0]?._id)
          return (
            <button
              key={g.user._id}
              className="flex w-16 shrink-0 flex-col items-center gap-1.5"
              onClick={() => setOpenAt(start)}
              aria-label={`View ${g.user.name}'s story`}
            >
              <Ring unseen={g.unseen}>
                <Avatar user={g.user} size="lg" />
              </Ring>
              <span className="w-full truncate text-center text-[11px] font-medium">{g.user.name || 'Student'}</span>
            </button>
          )
        })}

        {!groups.length && !user && (
          <p className="py-3 text-sm text-ink-500">Log in to share a story.</p>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
      {openAt !== null && <StoryViewer items={items} startIndex={openAt} onClose={() => setOpenAt(null)} />}
      {draft && user && (
        <StoryComposer imageUrl={draft} user={user} onCancel={() => setDraft(null)} onPosted={() => setDraft(null)} />
      )}
    </div>
  )
}
