import { Heart, MoreHorizontal, Pencil, Send, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
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
    <form onSubmit={submit} className="card p-4">
      <label className="sr-only" htmlFor="post-body">Your thought</label>
      <textarea
        id="post-body"
        className="input min-h-28 resize-y"
        placeholder={placeholder}
        value={text}
        maxLength={2000}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-neutral-400">{text.length}/2000</span>
        <button className="btn-primary" disabled={busy || !text.trim()}>
          {busy ? <Spinner className="size-4" /> : <Send className="size-4" />} Post
        </button>
      </div>
    </form>
  )
}

export function PostCard({ post, onChange }: { post: Post; onChange: () => void }) {
  const { user } = useAuth()
  const { toast } = useUi()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(post.body)
  const [menu, setMenu] = useState(false)
  const [busy, setBusy] = useState(false)

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

  const saveEdit = (e: FormEvent) => {
    e.preventDefault()
    if (!draft.trim()) return
    run(async () => {
      await api(`/posts/${post._id}`, { method: 'PATCH', body: { body: draft.trim() } })
      setEditing(false)
    }, 'Post updated')
  }

  return (
    <article className={cn('card p-4', post.hidden && 'opacity-60')}>
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar user={post.author} size="sm" />
          <div>
            <p className="text-sm font-semibold">{post.author.name || 'Student'}</p>
            <p className="text-xs text-neutral-400">
              @{post.author.username} · {formatShort(post.createdAt)}
            </p>
          </div>
        </div>
        {(canEdit || canDelete) && (
          <div className="relative">
            <button className="btn-ghost p-2" onClick={() => setMenu((m) => !m)} aria-label="Post actions">
              <MoreHorizontal className="size-4" />
            </button>
            {menu && (
              <>
                <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setMenu(false)} tabIndex={-1} />
                <div className="card absolute right-0 z-20 mt-1 w-44 overflow-hidden p-1 text-sm">
                  {canEdit && (
                    <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={() => { setEditing(true); setMenu(false) }}>
                      <Pencil className="size-4" /> Edit
                    </button>
                  )}
                  {canDelete && (
                    <button
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                      onClick={() => { setMenu(false); run(() => api(`/posts/${post._id}`, { method: 'DELETE' }), 'Post deleted') }}
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

      {post.hidden && <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">Hidden from the public feed</p>}

      {editing ? (
        <form onSubmit={saveEdit} className="mt-3">
          <textarea className="input min-h-24" value={draft} maxLength={2000} onChange={(e) => setDraft(e.target.value)} />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => { setEditing(false); setDraft(post.body) }}>Cancel</button>
            <button className="btn-primary" disabled={busy || !draft.trim()}>Save</button>
          </div>
        </form>
      ) : (
        <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{post.body}</p>
      )}

      <footer className="mt-3 flex items-center gap-1">
        <button
          className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition', post.likedByMe ? 'bg-red-50 text-red-600 dark:bg-red-950' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800')}
          disabled={busy || !user}
          onClick={() => run(() => api(`/posts/${post._id}/like`, { method: 'POST' }), post.likedByMe ? 'Like removed' : 'Liked')}
          aria-label={post.likedByMe ? 'Unlike' : 'Like'}
        >
          <Heart className={cn('size-4', post.likedByMe && 'fill-current')} /> {post.likes}
        </button>
        {!post.mine && (
          <Link to={`/u/${post.author.username}`} className="ml-auto text-xs font-medium text-neutral-500 hover:text-brand">
            View profile
          </Link>
        )}
      </footer>
    </article>
  )
}
