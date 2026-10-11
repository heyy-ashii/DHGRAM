import { PenLine } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PostCard } from '../components/PostCard'
import StoriesBar from '../components/StoriesBar'
import { EmptyState, ErrorState, PageSpinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { usePageMeta } from '../lib/usePageMeta'
import { usePosts, useStories } from '../lib/queries'

export default function Home() {
  usePageMeta()
  const { user } = useAuth()
  const { data: groups, isLoading: storiesLoading } = useStories()
  const { data: thoughts, isLoading, error, refetch } = usePosts({ limit: 20 })
  const posts = thoughts?.data.posts ?? []

  return (
    <div className="mx-auto max-w-2xl px-0 pb-12 sm:px-4">
      {storiesLoading ? (
        <div className="border-b border-neutral-200 px-4 py-4 dark:border-neutral-800">
          <div className="h-16 animate-pulse rounded-full bg-neutral-100 dark:bg-neutral-800" />
        </div>
      ) : (
        <StoriesBar groups={groups ?? []} />
      )}

      <div className="px-4 pt-6 sm:px-0">
        {user ? (
          <div className="card mb-6 flex flex-col items-center gap-3 p-6 text-center">
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              Share a thought from your profile to see it here.
            </p>
            <Link to={`/u/${user.username}`} className="btn-primary">
              <PenLine className="size-4" /> Share a thought
            </Link>
          </div>
        ) : (
          <div className="card mb-6 flex flex-col items-center gap-3 p-6 text-center">
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              Log in to share thoughts and stories with the community.
            </p>
            <div className="flex gap-2">
              <Link to="/login" className="btn-primary">Log in</Link>
              <Link to="/signup" className="btn-outline">Create account</Link>
            </div>
          </div>
        )}

        {isLoading ? (
          <PageSpinner />
        ) : error ? (
          <ErrorState message={error.message} onRetry={() => refetch()} />
        ) : posts.length === 0 ? (
          <EmptyState title="No thoughts yet">Be the first to share something.</EmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            {posts.map((p) => (
              <PostCard key={p._id} post={p} onChange={() => refetch()} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
