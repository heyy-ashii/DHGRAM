import { Heart, MoreHorizontal, Pencil, Send, Share2, Trash2 } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import { ReportButton } from './ReportModal'
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
    <form onSubmit={submit} className="card flex flex-col gap-5 p-6">
      <div className="flex items-center gap-3">
        {user && <Avatar user={user} size="sm" className="size-8" />}
        <p className="text-[13px] font-semibold">{user?.name ?? 'Share a thought'}</p>
      </div>
      <label className="sr-only" htmlFor="post-body">Your thought</label>
      <textarea
        id="post-body"
        className="min-h-24 w-full resize-y rounded-[10px] border border-ink-200 bg-ink-50 px-3.5 py-3.5 text-[15px] leading-6 outline-none transition placeholder:text-ink-400 focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-ink-800 dark:bg-ink-950/50"
        placeholder={placeholder}
        value={text}
        maxLength={2000}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center justify-between">
        <span className={cn('text-[11px] tabular-nums', text.length > 1800 ? 'font-semibold text-accent' : 'text-ink-400')}>
          {text.length} / 2000
        </span>
        <button className="btn-primary" disabled={busy || !text.trim()}>
          {busy ? <Spinner className="size-4" /> : <Send className="size-4" />} Post
        </button>
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
      className={cn('card animate-rise flex flex-col gap-4 p-5 transition hover:shadow-soft', post.hidden && 'opacity-70')}
      style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}
    >
      <header className="flex items-center gap-3">
        <Link to={`/u/${post.author.username}`} className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar user={post.author} size="md" />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-bold">{post.author.name || 'Student'}</span>
            <span className="block truncate text-[11px] text-ink-400">
              @{post.author.username} · {formatShort(post.createdAt)}
            </span>
          </span>
        </Link>
        {canEdit || canDelete ? (
          <div className="relative">
            <button className="grid size-11 place-items-center rounded-[10px] text-ink-500 transition hover:bg-ink-100 dark:hover:bg-ink-800" onClick={() => setMenu((m) => !m)} aria-label="Thought options">
              <MoreHorizontal className="size-5" />
            </button>
            {menu && (
              <>
                <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setMenu(false)} tabIndex={-1} />
                <div className="card animate-rise absolute right-0 z-20 mt-1 w-44 overflow-hidden p-1.5 text-sm shadow-lift">
                  {canEdit && (
                    <button
                      className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 font-medium hover:bg-ink-100 dark:hover:bg-ink-800"
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
                      className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
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
        ) : (
          <ReportButton kind="post" targetId={post._id} preview={post.body.slice(0, 140)} label="" className="grid size-11 place-items-center rounded-[10px] px-0" icon={<MoreHorizontal className="size-5" />} />
        )}
      </header>

      {post.hidden && (
        <p className="rounded-[10px] bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          Hidden from the public feed
        </p>
      )}

      {editing ? (
        <form onSubmit={saveEdit}>
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
        <div className="relative select-none" onMouseDown={doubleTapLike}>
          <p className="whitespace-pre-wrap break-words text-[15px] leading-[23px] text-ink-900 dark:text-ink-100">{post.body}</p>
          {burst && (
            <span className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
              <Heart className="heart-burst size-24 fill-red-500 text-red-500 drop-shadow-lg" />
            </span>
          )}
        </div>
      )}

      <footer className="flex items-center justify-between">
        <button
          className={cn(
            'inline-flex items-center gap-2 rounded-[10px] px-2 py-2 text-xs font-semibold transition active:scale-90',
            post.likedByMe ? 'text-brand' : 'text-ink-500 hover:text-brand',
          )}
          disabled={busy || !user}
          onClick={() => (post.likedByMe ? run(() => api(`/posts/${post._id}/like`, { method: 'POST' }), 'Like removed') : like())}
          aria-label={post.likedByMe ? 'Unlike' : 'Like'}
        >
          <Heart className={cn('size-5 transition group-active:scale-125', post.likedByMe && 'animate-pop fill-current')} />
          <span className="tabular-nums">{post.likes}</span>
        </button>

        <div className="flex items-center gap-4">
          {!post.mine && (
            <Link
              to={`/u/${post.author.username}`}
              className="inline-flex items-center gap-2 rounded-[10px] px-2 py-2 text-xs font-semibold text-brand transition hover:bg-brand-soft dark:hover:bg-brand/10"
            >
              Profile
            </Link>
          )}
          <button className="inline-flex items-center gap-2 rounded-[10px] px-2 py-2 text-xs text-ink-500 transition hover:text-ink-900 dark:hover:text-white" onClick={share} aria-label="Share">
            <Share2 className="size-[18px]" /> <span className="hidden sm:inline">Share</span>
          </button>
        </div>
      </footer>
    </article>
  )
}
