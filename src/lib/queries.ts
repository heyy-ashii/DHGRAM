import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import type { GroupSummary, MessageThread, PeerMessage, PostList, Stats, Story, StoryGroup, User, UserDirectory } from './types'

export const useStats = () =>
  useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => api<{ data: Stats }>('/admin/stats').then((r) => r.data),
    refetchInterval: 30000,
  })

export const useStories = () =>
  useQuery({
    queryKey: ['stories', 'feed'],
    queryFn: () => api<{ data: { groups: StoryGroup[] } }>('/stories').then((r) => r.data.groups),
    refetchInterval: 60000,
  })

export const useMyStories = (enabled = true) =>
  useQuery({
    queryKey: ['stories', 'mine'],
    queryFn: () => api<{ data: { stories: Story[] } }>('/stories/mine').then((r) => r.data.stories),
    enabled,
  })

export const usePosts = ({ page = 1, limit = 20, mine = false, author }: { page?: number; limit?: number; mine?: boolean; author?: string } = {}) =>
  useQuery({
    queryKey: ['posts', { page, limit, mine, author }],
    queryFn: () => api<PostList>('/posts', { query: { page, limit, mine: mine ? 'true' : undefined, author } }),
    placeholderData: (prev) => prev,
  })

export const useProfile = (username?: string) =>
  useQuery({
    queryKey: ['profile', username],
    queryFn: () => api<{ data: { user: User } }>(`/auth/users/${username}`).then((r) => r.data.user),
    enabled: Boolean(username),
    retry: false,
  })

export const useMessageThreads = (enabled = true) =>
  useQuery({
    queryKey: ['messages', 'list'],
    queryFn: () => api<{ data: { conversations: MessageThread[] } }>('/messages').then((r) => r.data.conversations),
    enabled,
    refetchInterval: 10000,
  })

export const useMessageThread = (id?: string) =>
  useQuery({
    queryKey: ['messages', id],
    queryFn: () => api<{ data: { conversation: MessageThread; messages: PeerMessage[] } }>(`/messages/${id}`).then((r) => r.data),
    enabled: Boolean(id),
    refetchInterval: 5000,
  })

export const useStudentDirectory = (q: string, enabled = true) =>
  useQuery({
    queryKey: ['messages', 'directory', q],
    queryFn: () => api<UserDirectory>('/messages/directory', { query: { q, limit: 30 } }),
    enabled,
  })

export const useGroups = (enabled = true) =>
  useQuery({
    queryKey: ['groups', 'list'],
    queryFn: () => api<{ data: { groups: GroupSummary[] } }>('/groups').then((r) => r.data.groups),
    enabled,
    refetchInterval: 10000,
  })

export const useGroup = (id?: string) =>
  useQuery({
    queryKey: ['groups', id],
    queryFn: () => api<{ data: { group: GroupSummary; messages: PeerMessage[] } }>(`/groups/${id}`).then((r) => r.data),
    enabled: Boolean(id),
    refetchInterval: 5000,
  })
