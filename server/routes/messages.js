import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { protect } from '../middleware/auth.js';
import { chatLimiter } from '../middleware/rateLimit.js';
import { objectId, validate } from '../middleware/validate.js';
import { PeerConversation, PeerMessage, isParticipant, pairFor, sideFor, unreadFor } from '../models/PeerChat.js';
import { User } from '../models/User.js';
import { loadRoster, normRegNo, usernameFromName } from '../roster.js';
import { AppError, asyncHandler } from '../utils/AppError.js';

// Student-to-student direct messages: list threads, start one, read and send.
// Documents come back as full documents so populate works on all three
// datastores; the shape* helpers only need a plain object.
const router = Router();
router.use(protect);

const plain = (doc) => (typeof doc.toObject === 'function' ? doc.toObject() : doc);

const shapePeerUser = (value) => {
  const peer = value && typeof value === 'object' ? value : { _id: value };
  return { _id: peer._id, name: peer.name ?? '', username: peer.username ?? '', avatar: peer.avatar ?? null };
};

const shapeConversation = (c, userId) => {
  const side = sideFor(c, userId);
  return {
    _id: c._id,
    // The peer is the other participant, which sideFor already resolved.
    peer: shapePeerUser(side?.peerId),
    lastMessage: c.lastMessage ?? '',
    lastMessageAt: c.lastMessageAt,
    unread: unreadFor(c, userId),
  };
};

const shapePeerMessage = (m, userId) => ({
  _id: m._id,
  body: m.body,
  sender: m.sender,
  mine: String(m.sender) === String(userId),
  createdAt: m.createdAt,
});

async function purgeOldPeerMessages(conversation) {
  const cutoff = new Date(Date.now() - config.chat.retentionDays * 24 * 60 * 60 * 1000);
  const removed = await PeerMessage.deleteMany({ conversation: conversation._id, createdAt: { $lt: cutoff } });
  if (!removed) return 0;
  const latest = await PeerMessage.findOne({ conversation: conversation._id }).sort({ createdAt: -1 }).lean();
  conversation.lastMessage = latest ? String(latest.body).slice(0, 140) : '';
  if (latest) conversation.lastMessageAt = latest.createdAt;
  await conversation.save();
  return removed;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const me = req.user._id;
    const conversations = await PeerConversation.find({ $or: [{ userA: me }, { userB: me }] })
      .sort({ lastMessageAt: -1 })
      .limit(200)
      .populate('userA', 'name username avatar')
      .populate('userB', 'name username avatar')
      .lean();
    res.set('Cache-Control', 'no-store');
    res.json({ status: 'success', data: { conversations: conversations.map((c) => shapeConversation(c, me)) } });
  }),
);

router.get(
  '/unread',
  asyncHandler(async (req, res) => {
    const me = req.user._id;
    const conversations = await PeerConversation.find({ $or: [{ userA: me }, { userB: me }] }).lean();
    const unread = conversations.reduce((sum, c) => sum + unreadFor(c, me), 0);
    res.json({ status: 'success', data: { unread } });
  }),
);

// Everyone a student can see in Messages: every roster student, plus any account
// that is not on the roster (the admin, hand-made accounts). A student is marked
// `joined` once they have signed in at least once; a roster student who has never
// signed in still appears, so the whole class is visible from the start.
// Accounts are matched to roster rows by registration number first, then by the
// username derived from the roster name, so a student appears exactly once.
const directoryQuery = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const shapeDirectoryUser = (u) => ({
  _id: u._id ?? null,
  name: u.name ?? '',
  username: u.username ?? '',
  avatar: u.avatar ?? null,
  joined: Boolean(u.joined),
});

async function directoryEntries(me) {
  const accounts = await User.find({}).lean();
  const roster = await loadRoster();
  const meId = String(me);
  const meAccount = accounts.find((a) => String(a._id) === meId);
  const meReg = meAccount?.regNo ? normRegNo(meAccount.regNo) : null;
  const meUsername = meAccount?.username ? String(meAccount.username).toLowerCase() : null;

  const byReg = new Map();
  const byUsername = new Map();
  for (const account of accounts) {
    if (account.regNo) byReg.set(normRegNo(account.regNo), account);
    if (account.username) byUsername.set(String(account.username).toLowerCase(), account);
  }

  const used = new Set();
  const entries = [];
  for (const student of roster) {
    const account = byReg.get(normRegNo(student.regNo)) ?? byUsername.get(usernameFromName(student.name));
    if (account) {
      used.add(String(account._id));
      if (String(account._id) === meId) continue;
      entries.push(shapeDirectoryUser({ ...account, joined: Boolean(account.lastLoginAt) }));
    } else if (normRegNo(student.regNo) !== meReg && usernameFromName(student.name) !== meUsername) {
      entries.push(shapeDirectoryUser({ _id: null, name: student.name, username: '', avatar: null, joined: false }));
    }
  }

  // Accounts that are not on the roster (the admin, hand-made accounts) stay visible.
  for (const account of accounts) {
    if (used.has(String(account._id)) || String(account._id) === meId) continue;
    entries.push(shapeDirectoryUser({ ...account, joined: Boolean(account.lastLoginAt) }));
  }
  return entries;
}

router.get(
  '/directory',
  validate(directoryQuery, 'query'),
  asyncHandler(async (req, res) => {
    const me = req.user._id;
    const { q, page, limit } = req.validated.query;
    let entries = await directoryEntries(me);
    if (q) {
      const term = q.toLowerCase();
      entries = entries.filter((u) => u.name.toLowerCase().includes(term) || u.username.toLowerCase().includes(term));
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    const total = entries.length;
    const start = (page - 1) * limit;
    res.set('Cache-Control', 'no-store');
    res.json({
      status: 'success',
      results: entries.slice(start, start + limit).length,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      data: { users: entries.slice(start, start + limit) },
    });
  }),
);

// Start (or reopen) a conversation with another student.
router.post(
  '/start',
  validate(z.object({ userId: objectId })),
  asyncHandler(async (req, res) => {
    const me = req.user._id;
    const otherId = req.body.userId;
    if (String(otherId) === String(me)) throw new AppError('You cannot message yourself', 400);

    const other = await User.findById(otherId);
    if (!other || other.status !== 'active') throw new AppError('That account is not available', 404);

    const { userA, userB } = pairFor(me, otherId);
    let conversation = await PeerConversation.findOne({ userA, userB });
    if (!conversation) conversation = await PeerConversation.create({ userA, userB });
    await conversation.populate('userA', 'name username avatar');
    await conversation.populate('userB', 'name username avatar');
    res.status(201).json({ status: 'success', data: { conversation: shapeConversation(plain(conversation), me) } });
  }),
);

async function loadConversation(id, userId) {
  const conversation = await PeerConversation.findById(id);
  if (!conversation) throw new AppError('Conversation not found', 404);
  if (!isParticipant(conversation, userId)) throw new AppError('Conversation not found', 404);
  return conversation;
}

router.get(
  '/:id',
  validate(z.object({ id: objectId }), 'params'),
  asyncHandler(async (req, res) => {
    const me = req.user._id;
    const conversation = await loadConversation(req.params.id, me);
    await purgeOldPeerMessages(conversation);
    await conversation.populate('userA', 'name username avatar');
    await conversation.populate('userB', 'name username avatar');

    const messages = await PeerMessage.find({ conversation: conversation._id }).sort({ createdAt: 1 }).limit(200).lean();
    const side = sideFor(conversation, me);
    if (side && (side.key === 'a' ? conversation.unreadForA : conversation.unreadForB)) {
      if (side.key === 'a') conversation.unreadForA = 0;
      else conversation.unreadForB = 0;
      await conversation.save();
    }
    res.set('Cache-Control', 'no-store');
    res.json({
      status: 'success',
      data: {
        conversation: shapeConversation(plain(conversation), me),
        messages: messages.map((m) => shapePeerMessage(m, me)),
      },
    });
  }),
);

router.post(
  '/:id',
  chatLimiter,
  validate(z.object({ id: objectId }), 'params'),
  validate(z.object({ body: z.string().trim().min(1, 'Message cannot be empty').max(2000) })),
  asyncHandler(async (req, res) => {
    const me = req.user._id;
    const conversation = await loadConversation(req.params.id, me);
    const message = await PeerMessage.create({ conversation: conversation._id, sender: me, body: req.body.body });

    const side = sideFor(conversation, me);
    conversation.lastMessage = req.body.body.slice(0, 140);
    conversation.lastMessageAt = message.createdAt;
    if (side.key === 'a') conversation.unreadForB += 1;
    else conversation.unreadForA += 1;
    await conversation.save();

    res.status(201).json({ status: 'success', data: { message: shapePeerMessage(plain(message), me) } });
  }),
);

// Delete a direct conversation and its messages. Either participant may delete
// it, and the thread disappears for both people.
router.delete(
  '/:id',
  validate(z.object({ id: objectId }), 'params'),
  asyncHandler(async (req, res) => {
    const me = req.user._id;
    const conversation = await loadConversation(req.params.id, me);
    await PeerMessage.deleteMany({ conversation: conversation._id });
    await conversation.deleteOne();
    res.status(204).end();
  }),
);

export { purgeOldPeerMessages };

export default router;
