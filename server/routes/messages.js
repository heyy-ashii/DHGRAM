import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { protect } from '../middleware/auth.js';
import { chatLimiter } from '../middleware/rateLimit.js';
import { objectId, validate } from '../middleware/validate.js';
import { PeerConversation, PeerMessage, isParticipant, pairFor, sideFor, unreadFor } from '../models/PeerChat.js';
import { User } from '../models/User.js';
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

// Everyone a student can start a chat with: active accounts, minus themselves.
const directoryQuery = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

router.get(
  '/directory',
  validate(directoryQuery, 'query'),
  asyncHandler(async (req, res) => {
    const me = req.user._id;
    const { q, page, limit } = req.validated.query;
    const filter = { status: 'active', _id: { $ne: me } };
    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(escaped, 'i');
      filter.$or = [{ name: rx }, { username: rx }];
    }
    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);
    res.set('Cache-Control', 'no-store');
    res.json({
      status: 'success',
      results: users.length,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      data: { users: users.map((u) => ({ _id: u._id, name: u.name ?? '', username: u.username ?? '', avatar: u.avatar ?? null })) },
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
