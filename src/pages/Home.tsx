import { Link } from 'react-router-dom'
import { ArrowRight, MessageCircle, SquarePen } from 'lucide-react'
import { PostCard } from '../components/PostCard'
import StoriesBar from '../components/StoriesBar'
import { EmptyState, ErrorState, FeedSkeleton } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { usePageMeta } from '../lib/usePageMeta'
import { usePosts, useStories } from '../lib/queries'

// Home reads as a quiet overview: a heading, the 24-hour stories strip, then the
// latest thoughts beside a context column. Copy comes from the Figma handoff.
export default function Home() {
  usePageMeta()
  const { user } = useAuth()
  const { data: groups, isLoading: storiesLoading } = useStories()
  const { data: thoughts, isLoading, error, refetch } = usePosts({ limit: 20 })
  const posts = thoughts?.data.posts ?? []

  return (
    <div className="flex flex-col gap-7 px-5 py-6 md:px-10 md:py-10">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-[28px] font-semibold leading-8 tracking-[-0.5px] md:text-[32px] md:leading-[37px]">
          A little closer to campus.
        </h1>
        <p className="text-sm text-ink-500">Good conversations start with a small thought.</p>
      </header>

      <div className="flex flex-col gap-7 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {storiesLoading ? (
            <div className="card flex gap-4 overflow-hidden p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex w-[54px] flex-col items-center gap-2">
                  <div className="size-[54px] animate-pulse rounded-full bg-ink-100 dark:bg-ink-800" />
                  <div className="h-2.5 w-10 animate-pulse rounded-full bg-ink-100 dark:bg-ink-800" />
                </div>
              ))}
            </div>
          ) : (
            <StoriesBar groups={groups ?? []} />
          )}

          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-bold">Latest thoughts</h2>
            <Link
              to="/feed"
              className="inline-flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13px] font-bold text-brand transition hover:bg-brand-soft dark:hover:bg-brand/10"
            >
              <SquarePen className="size-4" /> Go to Thoughts
            </Link>
          </div>

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
              <p className="py-1 text-center text-xs text-ink-400">You're all caught up for now.</p>
            </div>
          )}
        </div>

        {/* Context column: invitation + story guidance. Hidden before it would
            crowd the feed, per the responsive rules. */}
        <aside className="flex w-full flex-col gap-6 lg:w-[244px] lg:shrink-0">
          <div className="card flex flex-col gap-4 bg-brand-soft p-6 dark:bg-brand/10">
            <SquarePen className="size-5 text-brand" />
            <h2 className="font-heading text-2xl font-semibold leading-7 tracking-[-0.5px]">Your words belong here.</h2>
            <p className="text-[13px] leading-5 text-ink-600 dark:text-ink-300">
              A question, a small win, something on your mind. Share it in Thoughts.
            </p>
            <Link to="/feed" className="btn-primary mt-1 w-full">
              Go to Thoughts <ArrowRight className="size-4" />
            </Link>
          </div>

          <div className="flex flex-col gap-3 px-2">
            <h3 className="text-[13px] font-bold">A moment, not forever.</h3>
            <p className="text-xs leading-[19px] text-ink-500">
              Stories stay for 24 hours. Share a photo from your day, or see what your friends are up to.
            </p>
            <div className="h-px bg-ink-200 dark:bg-ink-800" />
            <p className="text-[11px] leading-[17px] text-ink-400">Made for the conversations between classes.</p>
          </div>
        </aside>
      </div>

      {!user && (
        <p className="text-center text-sm text-ink-500">
          <Link to="/login" className="font-semibold text-brand hover:underline">Log in</Link> to share thoughts and message students.
        </p>
      )}
    </div>
  )
}
