import { createCollection } from './odm.js';

// Column maps translate the camelCase fields the routes use into the snake_case
// columns created by supabase/migrations/0001_init.sql.

const dateFields = (extra = []) => ['createdAt', 'updatedAt', ...extra];

const userSpec = {
  name: 'Users',
  table: 'app_users',
  columns: {
    name: 'name',
    username: 'username',
    email: 'email',
    password: 'password',
    role: 'role',
    status: 'status',
    avatar: 'avatar',
    emailVerified: 'email_verified',
    passwordChangedAt: 'password_changed_at',
    lastLoginAt: 'last_login_at',
    failedLoginAttempts: 'failed_login_attempts',
    lockUntil: 'lock_until',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  dates: dateFields(['passwordChangedAt', 'lastLoginAt', 'lockUntil']),
  numbers: ['failedLoginAttempts'],
  booleans: ['emailVerified'],
  defaults: { role: 'user', status: 'active', failedLoginAttempts: 0, emailVerified: false },
  hashesPassword: true,
  publicJSON: (u) => ({
    _id: u._id,
    name: u.name,
    username: u.username,
    email: u.email ?? null,
    role: u.role,
    status: u.status,
    avatar: u.avatar ?? null,
    emailVerified: Boolean(u.emailVerified),
    lastLoginAt: u.lastLoginAt ?? null,
    createdAt: u.createdAt,
  }),
};

const otpSpec = {
  name: 'Otps',
  table: 'app_otps',
  columns: {
    email: 'email',
    purpose: 'purpose',
    codeHash: 'code_hash',
    attempts: 'attempts',
    expiresAt: 'expires_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  dates: dateFields(['expiresAt']),
  numbers: ['attempts'],
  defaults: { attempts: 0 },
  upsertOn: ['email', 'purpose'],
  publicJSON: (o) => ({ _id: o._id, email: o.email, purpose: o.purpose, attempts: o.attempts, expiresAt: o.expiresAt }),
};

const conversationSpec = {
  name: 'Conversations',
  table: 'app_conversations',
  columns: {
    user: 'user_id',
    status: 'status',
    lastMessage: 'last_message',
    lastMessageAt: 'last_message_at',
    unreadForAdmin: 'unread_for_admin',
    unreadForUser: 'unread_for_user',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  dates: dateFields(['lastMessageAt']),
  numbers: ['unreadForAdmin', 'unreadForUser'],
  defaults: { status: 'open', lastMessage: '', unreadForAdmin: 0, unreadForUser: 0, lastMessageAt: () => new Date() },
  publicJSON: (c) => ({ ...c }),
};

const messageSpec = {
  name: 'Messages',
  table: 'app_messages',
  columns: {
    conversation: 'conversation_id',
    sender: 'sender_id',
    senderRole: 'sender_role',
    body: 'body',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  dates: dateFields(),
  publicJSON: (m) => ({ _id: m._id, body: m.body, senderRole: m.senderRole, sender: m.sender, createdAt: m.createdAt }),
};

const postSpec = {
  name: 'Posts',
  table: 'app_posts',
  columns: {
    author: 'author_id',
    body: 'body',
    likes: 'likes',
    hidden: 'hidden',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  dates: dateFields(),
  booleans: ['hidden'],
  defaults: { likes: [], hidden: false },
  publicJSON: (p) => ({ ...p }),
};

const peerConversationSpec = {
  name: 'PeerConversations',
  table: 'app_peer_conversations',
  columns: {
    userA: 'user_a',
    userB: 'user_b',
    lastMessage: 'last_message',
    lastMessageAt: 'last_message_at',
    unreadForA: 'unread_for_a',
    unreadForB: 'unread_for_b',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  dates: dateFields(['lastMessageAt']),
  numbers: ['unreadForA', 'unreadForB'],
  defaults: { lastMessage: '', unreadForA: 0, unreadForB: 0, lastMessageAt: () => new Date() },
  upsertOn: ['user_a', 'user_b'],
  publicJSON: (c) => ({ ...c }),
};

const peerMessageSpec = {
  name: 'PeerMessages',
  table: 'app_peer_messages',
  columns: {
    conversation: 'conversation_id',
    sender: 'sender_id',
    body: 'body',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  dates: dateFields(),
  publicJSON: (m) => ({ _id: m._id, conversation: m.conversation, sender: m.sender, body: m.body, createdAt: m.createdAt }),
};

const groupSpec = {
  name: 'Groups',
  table: 'app_groups',
  columns: {
    name: 'name',
    createdBy: 'created_by',
    members: 'members',
    lastMessage: 'last_message',
    lastMessageAt: 'last_message_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  dates: dateFields(['lastMessageAt']),
  defaults: { members: [], lastMessage: '', lastMessageAt: () => new Date() },
  publicJSON: (g) => ({ ...g }),
};

const groupMemberSpec = {
  name: 'GroupMembers',
  table: 'app_group_members',
  columns: {
    group: 'group_id',
    user: 'user_id',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  dates: dateFields(),
  upsertOn: ['group_id', 'user_id'],
  publicJSON: (m) => ({ ...m }),
};

const groupMessageSpec = {
  name: 'GroupMessages',
  table: 'app_group_messages',
  columns: {
    group: 'group_id',
    sender: 'sender_id',
    body: 'body',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  dates: dateFields(),
  publicJSON: (m) => ({ _id: m._id, group: m.group, sender: m.sender, body: m.body, createdAt: m.createdAt }),
};

const storySpec = {
  name: 'Stories',
  table: 'app_stories',
  columns: {
    author: 'author_id',
    imageUrl: 'image_url',
    caption: 'caption',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  dates: dateFields(),
  defaults: { caption: '' },
  publicJSON: (s) => ({ ...s }),
};

const storyViewSpec = {
  name: 'StoryViews',
  table: 'app_story_views',
  columns: {
    story: 'story_id',
    viewer: 'viewer_id',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  dates: dateFields(),
  upsertOn: ['story_id', 'viewer_id'],
  publicJSON: (v) => ({ ...v }),
};

export const SupabaseUser = createCollection(userSpec);
export const SupabaseOtp = createCollection(otpSpec);
export const SupabaseConversation = createCollection(conversationSpec);
export const SupabaseMessage = createCollection(messageSpec);
export const SupabasePost = createCollection(postSpec);
export const SupabasePeerConversation = createCollection(peerConversationSpec);
export const SupabasePeerMessage = createCollection(peerMessageSpec);
export const SupabaseGroup = createCollection(groupSpec);
export const SupabaseGroupMember = createCollection(groupMemberSpec);
export const SupabaseGroupMessage = createCollection(groupMessageSpec);
export const SupabaseStory = createCollection(storySpec);
export const SupabaseStoryView = createCollection(storyViewSpec);

conversationSpec.populates = { user: SupabaseUser };
postSpec.populates = { author: SupabaseUser };
peerConversationSpec.populates = { userA: SupabaseUser, userB: SupabaseUser };
peerMessageSpec.populates = { sender: SupabaseUser };
groupMessageSpec.populates = { sender: SupabaseUser };
storySpec.populates = { author: SupabaseUser };

export const publicUser = userSpec.publicJSON;
