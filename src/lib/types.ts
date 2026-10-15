export type Role = 'user' | 'admin'

export type Suspension = 'active' | 'suspended' | 'dismissed'

export interface User {
  _id: string
  name: string
  username: string
  regNo?: string | null
  email: string | null
  role: Role
  status: 'active' | 'disabled'
  suspendedUntil?: string | null
  suspension?: Suspension
  avatar?: string | null
  emailVerified: boolean
  lastLoginAt: string | null
  createdAt: string
}

export type ReportKind = 'post' | 'story' | 'user'

export interface Report {
  _id: string
  reporter: string
  reporterName: string
  kind: ReportKind
  targetId: string
  targetLabel: string
  reason: string
  details: string
  status: 'open' | 'resolved' | 'dismissed'
  handledBy?: string | null
  handledAt?: string | null
  createdAt: string
  targetAuthor?: { _id: string; name: string; username: string } | null
}

export interface ReportList {
  total: number
  page: number
  pages: number
  data: { reports: Report[] }
}

export interface Post {
  _id: string
  body: string
  author: Pick<User, '_id' | 'name' | 'username'>
  likes: number
  likedByMe: boolean
  mine: boolean
  hidden: boolean
  createdAt: string
  updatedAt: string
}

export interface PostList {
  results: number
  total: number
  page: number
  pages: number
  data: { posts: Post[] }
}

export interface AdminThoughtsList {
  total: number
  page: number
  pages: number
  data: { posts: Post[] }
}

export type PeerUser = Pick<User, '_id' | 'name' | 'username'> & { avatar?: string | null }

// A row in the Messages directory. `joined` is false for a roster student who has
// not signed in yet; such rows have no `_id` and cannot be messaged.
export interface DirectoryUser extends Omit<PeerUser, '_id'> {
  _id: string | null
  joined: boolean
}

export interface ChatMessage {
  _id: string
  body: string
  senderRole: Role
  createdAt: string
}

export interface Conversation {
  _id: string
  user: Pick<User, '_id' | 'name' | 'username' | 'email'>
  status: 'open' | 'closed'
  lastMessage: string
  lastMessageAt: string
  unreadForAdmin: number
  unreadForUser: number
}

export interface Story {
  _id: string
  imageUrl: string
  caption: string
  author: PeerUser
  mine: boolean
  seen: boolean
  createdAt: string
}

export interface StoryGroup {
  user: PeerUser
  unseen: boolean
  stories: Story[]
}

export interface MessageThread {
  _id: string
  peer: PeerUser
  lastMessage: string
  lastMessageAt: string
  unread: number
}

export interface GroupSummary {
  _id: string
  name: string
  createdBy: string
  members: PeerUser[]
  memberCount: number
  mine: boolean
  lastMessage: string
  lastMessageAt: string
}

export interface PeerMessage {
  _id: string
  body: string
  sender: string
  mine: boolean
  createdAt: string
}

export interface UserDirectory {
  results: number
  total: number
  page: number
  pages: number
  data: { users: DirectoryUser[] }
}

// A student in the admin support inbox's full directory. `conversationId` is null
// until a support thread exists for them.
export interface SupportStudent {
  _id: string
  name: string
  username: string
  regNo?: string | null
  avatar?: string | null
  conversationId: string | null
  status: 'open' | 'closed' | null
  lastMessage: string
  lastMessageAt: string | null
  unreadForAdmin: number
}

export interface SupportDirectory {
  total: number
  page: number
  pages: number
  data: { students: SupportStudent[] }
}

export interface Stats {
  users: number
  admins: number
  disabled: number
  suspended: number
  openReports: number
  openChats: number
  unreadMessages: number
}
