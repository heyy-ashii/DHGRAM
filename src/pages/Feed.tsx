import { MessageSquare } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import BrandName from '../components/BrandName'
import { Composer, PostCard } from '../components/PostCard'
import { EmptyState, ErrorState, PageSpinner } from '../components/ui'
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
    <div className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold">Thoughts</h1>
        <p className="mt-1 text-sm text-slate-500">Share what's on your mind with the <BrandName /> community.</p>
      </header>

      {user ? (
        <div className="mb-6">
          <Composer placeholder="Share a thought with the DHGRAM community…" onDone={() => { setPage(1); refetch() }} />
        </div>
      ) : (
        <div className="card mb-6 flex flex-col items-center gap-3 p-6 text-center">
          <span className="surface-brand grid size-12 place-items-center rounded-2xl">
            <MessageSquare className="size-6" />
          </span>
          <p className="text-sm text-slate-600 dark:text-slate-300">Log in to share your thoughts and like posts.</p>
          <Link to="/login" className="btn-primary">Log in</Link>
        </div>
      )}

      {isLoading ? (
        <PageSpinner />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      ) : posts.length === 0 ? (
        <EmptyState title="No thoughts yet" icon={MessageSquare}>Be the first to share something.</EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {posts.map((p) => (
            <PostCard key={p._id} post={p} onChange={() => refetch()} />
          ))}
        </div>
      )}

      {data && data.pages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-3">
          <button className="btn-outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
          <span className="text-sm text-slate-500">Page {data.page} of {data.pages}</span>
          <button className="btn-outline" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  )
}
