import { Link } from 'react-router-dom'
import { MessageCircle, Sparkles } from 'lucide-react'
import { PostCard } from '../components/PostCard'
import StoriesBar from '../components/StoriesBar'
import BrandName from '../components/BrandName'
import { EmptyState, ErrorState, FeedSkeleton } from '../components/ui'
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
    <div className="mx-auto max-w-2xl pb-16 sm:px-4">
      {!user && (
        <section className="relative mx-4 mt-6 overflow-hidden rounded-[2rem] border border-ink-200/70 bg-white/70 p-8 text-center backdrop-blur sm:mx-0 sm:p-10 dark:border-ink-800 dark:bg-ink-900/60">
          <span className="eyebrow justify-center">
            <Sparkles className="size-3.5" /> The DHGRAM community
          </span>
          <h1 className="mt-4 text-balance font-heading text-3xl font-bold leading-tight sm:text-4xl">
            Share thoughts. Message students.
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-500">
            Join <BrandName /> to post what's on your mind and chat one-to-one or in groups.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/login" className="btn-primary px-5 py-3">Log in</Link>
            <Link to="/signup" className="btn-outline px-5 py-3">Create account</Link>
          </div>
        </section>
      )}

      {storiesLoading ? (
        <div className="flex gap-4 px-4 py-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex w-[72px] flex-col items-center gap-2">
              <div className="size-[68px] animate-pulse rounded-full bg-ink-100 dark:bg-ink-800" />
              <div className="h-2.5 w-12 animate-pulse rounded-full bg-ink-100 dark:bg-ink-800" />
            </div>
          ))}
        </div>
      ) : (
        <StoriesBar groups={groups ?? []} />
      )}

      <div className="px-4 pt-6 sm:px-0">
        {isLoading ? (
          <FeedSkeleton />
        ) : error ? (
          <ErrorState message={error.message} onRetry={() => refetch()} />
        ) : posts.length === 0 ? (
          <EmptyState title="No thoughts yet" icon={MessageCircle}>
            Be the first to share something with the community.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            {posts.map((p, i) => (
              <PostCard key={p._id} post={p} index={i} onChange={() => refetch()} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
