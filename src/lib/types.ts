export type Role = 'user' | 'admin'

export interface User {
  _id: string
  name: string
  username: string
  email: string | null
  role: Role
  status: 'active' | 'disabled'
  avatar?: string | null
  emailVerified: boolean
  lastLoginAt: string | null
  createdAt: string
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

export type PeerUser = Pick<User, '_id' | 'name' | 'username'> & { avatar?: string | null }

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
  data: { users: PeerUser[] }
}

export interface Stats {
  users: number
  admins: number
  disabled: number
  openChats: number
  unreadMessages: number
}
