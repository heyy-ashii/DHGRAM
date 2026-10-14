import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import { Composer, PostCard } from '../components/PostCard'
import { EmptyState, ErrorState, FeedSkeleton } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { usePageMeta } from '../lib/usePageMeta'
import { usePosts } from '../lib/queries'

// Thoughts: the composer, the feed, and a short writing-guidance column.
export default function Feed() {
  usePageMeta('Thoughts')
  const { user } = useAuth()
  const [page, setPage] = useState(1)
  const { data, isLoading, error, refetch } = usePosts({ page, limit: 20 })
  const posts = data?.data.posts ?? []

  return (
    <div className="flex flex-col gap-7 px-5 py-6 md:px-10 md:py-10">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-[28px] font-semibold leading-8 tracking-[-0.5px] md:text-[32px] md:leading-[37px]">Thoughts</h1>
        <p className="text-sm text-ink-500">Share what's on your mind with the DHGRAM community.</p>
      </header>

      <div className="flex flex-col gap-7 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {user ? (
            <Composer placeholder="Share a thought with the DHGRAM community…" onDone={() => { setPage(1); refetch() }} />
          ) : (
            <div className="card flex flex-col items-center gap-4 p-8 text-center">
              <p className="text-sm text-ink-500">Log in to share your thoughts and like posts.</p>
              <Link to="/login" className="btn-primary">Log in</Link>
            </div>
          )}

          {isLoading ? (
            <FeedSkeleton />
          ) : error ? (
            <ErrorState message={error.message} onRetry={() => refetch()} />
          ) : posts.length === 0 ? (
            <EmptyState title="No thoughts yet" icon={MessageCircle}>
              Be the first to share something.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-4">
              {posts.map((p, i) => (
                <PostCard key={p._id} post={p} index={i} onChange={() => refetch()} />
              ))}
            </div>
          )}

          {data && data.pages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-2">
              <button className="btn-outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </button>
              <span className="text-xs tabular-nums text-ink-500">Page {data.page} of {data.pages}</span>
              <button className="btn-outline" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          )}
        </div>

        <aside className="w-full lg:w-[244px] lg:shrink-0">
          <div className="card flex flex-col gap-5 p-6">
            <h2 className="font-heading text-2xl font-semibold leading-7 tracking-[-0.5px]">Keep it human.</h2>
            <p className="text-[13px] leading-5 text-ink-600 dark:text-ink-300">
              Share a thought, ask a question, or put a small moment into words.
            </p>
            <p className="text-xs leading-[19px] text-ink-400">Up to 2,000 characters. Text only.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
