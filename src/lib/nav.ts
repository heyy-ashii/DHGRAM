import { Crown, Home, MessageCircle, SquarePen, User as UserIcon, type LucideIcon } from 'lucide-react'

export type NavItem = { key: string; label: string; icon: LucideIcon; to: string }

// The signed-in app routes: Home, Thoughts, Messages, Chess, Profile.
// `to` is filled in per-render for the profile route so it points at the
// signed-in user.
export const baseNav: Omit<NavItem, 'to'>[] = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'feed', label: 'Thoughts', icon: SquarePen },
  { key: 'messages', label: 'Messages', icon: MessageCircle },
  { key: 'chess', label: 'Chess', icon: Crown },
  { key: 'profile', label: 'Profile', icon: UserIcon },
]

export function navItems(profileTo: string): NavItem[] {
  return baseNav.map((item) => ({ ...item, to: item.key === 'profile' ? profileTo : { home: '/', feed: '/feed', messages: '/messages', chess: '/chess' }[item.key]! }))
}
