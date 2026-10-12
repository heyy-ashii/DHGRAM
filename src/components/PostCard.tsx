import { Heart, MessageCircle, MoreHorizontal, Pencil, Send, Share2, Trash2 } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import { Spinner } from './ui'
import { useAuth } from '../context/AuthContext'
import { useUi } from '../context/UiContext'
import { api, errorMessage } from '../lib/api'
import type { Post } from '../lib/types'
import { cn, formatShort } from '../lib/utils'

export function Composer({ onDone, placeholder = 'Share a thought…' }: { onDone: () => void; placeholder?: string }) {
  const { toast } = useUi()
  const { user } = useAuth()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    try {
      await api('/posts', { method: 'POST', body: { body: text.trim() } })
      setText('')
      toast('Posted')
      onDone()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="card p-4 sm:p-5">
      <div className="flex gap-3">
        {user && <Avatar user={user} size="sm" className="mt-0.5" />}
        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor="post-body">Your thought</label>
          <textarea
            id="post-body"
            className="input min-h-24 resize-y border-0 bg-ink-50 px-4 py-3 focus:bg-white dark:bg-ink-950/60 dark:focus:bg-ink-950"
            placeholder={placeholder}
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="mt-3 flex items-center justify-between">
            <span className={cn('text-xs tabular-nums', text.length > 1800 ? 'font-semibold text-accent' : 'text-ink-400')}>
              {text.length}/2000
            </span>
            <button className="btn-primary" disabled={busy || !text.trim()}>
              {busy ? <Spinner className="size-4" /> : <Send className="size-4" />} Post
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}

export function PostCard({ post, onChange, index = 0 }: { post: Post; onChange: () => void; index?: number }) {
  const { user } = useAuth()
  const { toast } = useUi()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(post.body)
  const [menu, setMenu] = useState(false)
  const [busy, setBusy] = useState(false)
  // Instagram-style: a quick second tap on the thought fires the big heart.
  const [burst, setBurst] = useState(false)
  const lastTap = useRef(0)
  const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const canEdit = post.mine
  const canDelete = post.mine

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true)
    try {
      await fn()
      toast(msg)
      onChange()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const like = async () => {
    try {
      await api(`/posts/${post._id}/like`, { method: 'POST' })
      onChange()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const doubleTapLike = () => {
    const now = Date.now()
    const isDouble = now - lastTap.current < 300
    lastTap.current = now
    if (!isDouble || !user || post.likedByMe) return
    setBurst(true)
    if (burstTimer.current) clearTimeout(burstTimer.current)
    burstTimer.current = setTimeout(() => setBurst(false), 800)
    like()
  }

  const share = async () => {
    const url = `${window.location.origin}/u/${post.author.username}`
    try {
      if (navigator.share) await navigator.share({ title: post.author.name || 'DHGRAM', url })
      else {
        await navigator.clipboard.writeText(url)
        toast('Link copied')
      }
    } catch {
      /* the user dismissed the share sheet */
    }
  }

  const saveEdit = (e: FormEvent) => {
    e.preventDefault()
    if (!draft.trim()) return
    run(async () => {
      await api(`/posts/${post._id}`, { method: 'PATCH', body: { body: draft.trim() } })
      setEditing(false)
    }, 'Post updated')
  }

  return (
    <article
      className={cn('card animate-rise overflow-hidden transition hover:shadow-lift', post.hidden && 'opacity-70')}
      style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}
    >
      <header className="flex items-center justify-between gap-3 px-4 pt-4">
        <Link to={`/u/${post.author.username}`} className="flex min-w-0 items-center gap-3">
          <Avatar user={post.author} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{post.author.name || 'Student'}</p>
            <p className="truncate text-xs text-ink-400">
              @{post.author.username} · {formatShort(post.createdAt)}
            </p>
          </div>
        </Link>
        {(canEdit || canDelete) && (
          <div className="relative">
            <button className="btn-ghost p-2" onClick={() => setMenu((m) => !m)} aria-label="Post actions">
              <MoreHorizontal className="size-4" />
            </button>
            {menu && (
              <>
                <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setMenu(false)} tabIndex={-1} />
                <div className="card animate-rise absolute right-0 z-20 mt-1 w-44 overflow-hidden p-1.5 text-sm">
                  {canEdit && (
                    <button
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 font-medium hover:bg-ink-100 dark:hover:bg-ink-800"
                      onClick={() => {
                        setEditing(true)
                        setMenu(false)
                      }}
                    >
                      <Pencil className="size-4" /> Edit
                    </button>
                  )}
                  {canDelete && (
                    <button
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                      onClick={() => {
                        setMenu(false)
                        run(() => api(`/posts/${post._id}`, { method: 'DELETE' }), 'Post deleted')
                      }}
                    >
                      <Trash2 className="size-4" /> Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </header>

      {post.hidden && (
        <p className="mx-4 mt-3 rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          Hidden from the public feed
        </p>
      )}

      {editing ? (
        <form onSubmit={saveEdit} className="px-4 py-3">
          <textarea className="input min-h-24" value={draft} maxLength={2000} onChange={(e) => setDraft(e.target.value)} />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setEditing(false)
                setDraft(post.body)
              }}
            >
              Cancel
            </button>
            <button className="btn-primary" disabled={busy || !draft.trim()}>
              Save
            </button>
          </div>
        </form>
      ) : (
        <div className="relative select-none px-4 py-3" onMouseDown={doubleTapLike}>
          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink-800 dark:text-ink-100">{post.body}</p>
          {burst && (
            <span className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
              <Heart className="heart-burst size-24 fill-red-500 text-red-500 drop-shadow-lg" />
            </span>
          )}
        </div>
      )}

      <footer className="flex items-center gap-1 border-t border-ink-100 px-3 py-2 dark:border-ink-800">
        <button
          className={cn(
            'group inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition active:scale-90',
            post.likedByMe
              ? 'text-red-500'
              : 'text-ink-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40',
          )}
          disabled={busy || !user}
          onClick={() => (post.likedByMe ? run(() => api(`/posts/${post._id}/like`, { method: 'POST' }), 'Like removed') : like())}
          aria-label={post.likedByMe ? 'Unlike' : 'Like'}
        >
          <Heart className={cn('size-5 transition group-active:scale-125', post.likedByMe && 'animate-pop fill-current')} />
          <span className="tabular-nums">{post.likes}</span>
        </button>

        <button className="btn-ghost px-3 py-1.5 text-ink-400" onClick={share} aria-label="Share">
          <Share2 className="size-5" />
        </button>

        {!post.mine && (
          <Link
            to={`/u/${post.author.username}`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-ink-400 transition hover:text-brand"
          >
            <MessageCircle className="size-5" /> <span className="hidden sm:inline">Profile</span>
          </Link>
        )}
      </footer>
    </article>
  )
}
