import { createCollection } from './odm.js';

const dateFields = (extra = []) => ['createdAt', 'updatedAt', ...extra];

const userSpec = {
  name: 'Users',
  dates: dateFields(['passwordChangedAt', 'lastLoginAt', 'lockUntil', 'suspendedUntil']),
  numbers: ['failedLoginAttempts'],
  booleans: ['emailVerified'],
  defaults: { role: 'user', status: 'active', failedLoginAttempts: 0, emailVerified: false },
  hashesPassword: true,
  publicJSON: (u) => ({
    _id: u._id,
    name: u.name,
    username: u.username,
    regNo: u.regNo ?? null,
    email: u.email ?? null,
    role: u.role,
    status: u.status,
    suspendedUntil: u.suspendedUntil ?? null,
    avatar: u.avatar ?? null,
    emailVerified: Boolean(u.emailVerified),
    lastLoginAt: u.lastLoginAt ?? null,
    createdAt: u.createdAt,
  }),
};

const otpSpec = {
  name: 'Otps',
  dates: dateFields(['expiresAt']),
  numbers: ['attempts'],
  defaults: { attempts: 0 },
  publicJSON: (o) => ({ _id: o._id, email: o.email, purpose: o.purpose, attempts: o.attempts, expiresAt: o.expiresAt }),
};

const conversationSpec = {
  name: 'Conversations',
  dates: dateFields(['lastMessageAt']),
  numbers: ['unreadForAdmin', 'unreadForUser'],
  defaults: { status: 'open', lastMessage: '', unreadForAdmin: 0, unreadForUser: 0, lastMessageAt: () => new Date() },
  publicJSON: (c) => ({ ...c }),
};

const messageSpec = {
  name: 'Messages',
  dates: dateFields(),
  publicJSON: (m) => ({ _id: m._id, body: m.body, senderRole: m.senderRole, sender: m.sender, createdAt: m.createdAt }),
};

const postSpec = {
  name: 'Posts',
  dates: dateFields(),
  booleans: ['hidden'],
  defaults: { likes: [], hidden: false },
  publicJSON: (p) => ({ ...p }),
};

const peerConversationSpec = {
  name: 'PeerConversations',
  dates: dateFields(['lastMessageAt']),
  numbers: ['unreadForA', 'unreadForB'],
  defaults: { lastMessage: '', unreadForA: 0, unreadForB: 0, lastMessageAt: () => new Date() },
  publicJSON: (c) => ({ ...c }),
};

const peerMessageSpec = {
  name: 'PeerMessages',
  dates: dateFields(),
  publicJSON: (m) => ({ _id: m._id, conversation: m.conversation, sender: m.sender, body: m.body, createdAt: m.createdAt }),
};

const groupSpec = {
  name: 'Groups',
  dates: dateFields(['lastMessageAt']),
  arrays: ['members'],
  defaults: { members: [], lastMessage: '', lastMessageAt: () => new Date() },
  publicJSON: (g) => ({ ...g }),
};

const groupMemberSpec = {
  name: 'GroupMembers',
  dates: dateFields(),
  publicJSON: (m) => ({ ...m }),
};

const groupMessageSpec = {
  name: 'GroupMessages',
  dates: dateFields(),
  publicJSON: (m) => ({ _id: m._id, group: m.group, sender: m.sender, body: m.body, createdAt: m.createdAt }),
};

const storySpec = {
  name: 'Stories',
  dates: dateFields(),
  defaults: { caption: '' },
  publicJSON: (s) => ({ ...s }),
};

const storyViewSpec = {
  name: 'StoryViews',
  dates: dateFields(),
  publicJSON: (v) => ({ ...v }),
};

const reportSpec = {
  name: 'Reports',
  dates: dateFields(['handledAt']),
  publicJSON: (r) => ({ ...r }),
};

// One-to-one chess games. `moves` is stored as a JSON column (see Code.gs), so
// the Sheet holds the SAN list without a per-move tab.
const gameSpec = {
  name: 'Games',
  dates: dateFields(['acceptedAt', 'finishedAt', 'lastMoveAt']),
  arrays: ['moves'],
  defaults: { status: 'pending', moves: [], result: null, resultReason: null, drawOfferedBy: null },
  publicJSON: (g) => ({ ...g }),
};

export const SheetsUser = createCollection(userSpec);
export const SheetsOtp = createCollection(otpSpec);
export const SheetsConversation = createCollection(conversationSpec);
export const SheetsMessage = createCollection(messageSpec);
export const SheetsPost = createCollection(postSpec);
export const SheetsPeerConversation = createCollection(peerConversationSpec);
export const SheetsPeerMessage = createCollection(peerMessageSpec);
export const SheetsGroup = createCollection(groupSpec);
export const SheetsGroupMember = createCollection(groupMemberSpec);
export const SheetsGroupMessage = createCollection(groupMessageSpec);
export const SheetsStory = createCollection(storySpec);
export const SheetsStoryView = createCollection(storyViewSpec);
export const SheetsReport = createCollection(reportSpec);
export const SheetsGame = createCollection(gameSpec);

conversationSpec.populates = { user: SheetsUser };
postSpec.populates = { author: SheetsUser };
peerConversationSpec.populates = { userA: SheetsUser, userB: SheetsUser };
peerMessageSpec.populates = { sender: SheetsUser };
groupMessageSpec.populates = { sender: SheetsUser };
storySpec.populates = { author: SheetsUser };
gameSpec.populates = { white: SheetsUser, black: SheetsUser, invitedBy: SheetsUser };

// Shared shape for a user as returned to clients, used for .lean() results.
export const publicUser = userSpec.publicJSON;
