import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle, Sparkles } from 'lucide-react'
import BrandName from '../components/BrandName'
import { Composer, PostCard } from '../components/PostCard'
import { EmptyState, ErrorState, FeedSkeleton } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { usePageMeta } from '../lib/usePageMeta'
import { usePosts } from '../lib/queries'

export default function Feed() {
  usePageMeta('Thoughts')
  const { user } = useAuth()
  const [page, setPage] = useState(1)
  const { data, isLoading, error, refetch } = usePosts({ page, limit: 20 })
  const posts = data?.data.posts ?? []

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <header className="mb-7">
        <span className="eyebrow">
          <Sparkles className="size-3.5" /> Community
        </span>
        <h1 className="mt-3 text-4xl font-extrabold">Thoughts</h1>
        <p className="mt-2 text-sm text-ink-500">
          Share what's on your mind with the <BrandName /> community.
        </p>
      </header>

      {user ? (
        <div className="mb-6">
          <Composer placeholder="Share a thought with the DHGRAM community…" onDone={() => { setPage(1); refetch() }} />
        </div>
      ) : (
        <div className="card mb-6 flex flex-col items-center gap-4 p-8 text-center">
          <p className="text-sm text-ink-600 dark:text-ink-300">Log in to share your thoughts and like posts.</p>
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
        <div className="mt-10 flex items-center justify-center gap-4">
          <button className="btn-outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </button>
          <span className="text-sm font-medium tabular-nums text-ink-500">
            Page {data.page} of {data.pages}
          </span>
          <button className="btn-outline" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  )
}
