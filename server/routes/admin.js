import { Router } from 'express';
import { z } from 'zod';
import { protect, restrictTo } from '../middleware/auth.js';
import { email, name, objectId, password, username, validate } from '../middleware/validate.js';
import { Conversation, Message } from '../models/Chat.js';
import { Group, GroupMessage } from '../models/GroupChat.js';
import { PeerConversation, PeerMessage } from '../models/PeerChat.js';
import { Post } from '../models/Post.js';
import { Story, StoryView } from '../models/Story.js';
import { User } from '../models/User.js';
import { AppError, asyncHandler } from '../utils/AppError.js';

// Admin-only management API, mounted at /api/v1/admin. The support inbox itself
// lives on the chat routes (/chat/conversations*, guarded by restrictTo('admin'));
// this router covers the dashboard counters and user administration.
const router = Router();
router.use(protect, restrictTo('admin'));

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const publicUser = (u) =>
  u && typeof u.toPublicJSON === 'function'
    ? u.toPublicJSON()
    : {
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
      };

router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const [users, admins, disabled, openChats, unread] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ status: 'disabled' }),
      Conversation.countDocuments({ status: 'open' }),
      Conversation.aggregate([{ $group: { _id: null, total: { $sum: '$unreadForAdmin' } } }]),
    ]);
    res.json({
      status: 'success',
      data: { users, admins, disabled, openChats, unreadMessages: unread[0]?.total ?? 0 },
    });
  }),
);

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(['user', 'admin']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.get(
  '/users',
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const { q, role, status, page, limit } = req.validated.query;
    const filter = {};
    if (role) filter.role = role;
    if (status) filter.status = status;
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ name: rx }, { username: rx }, { email: rx }];
    }
    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);
    res.json({
      status: 'success',
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      data: { users: users.map(publicUser) },
    });
  }),
);

const optionalEmail = z.preprocess((v) => (v === '' || v === null ? undefined : v), email.optional());

router.post(
  '/users',
  validate(
    z.object({
      name,
      username,
      email: optionalEmail,
      password,
      role: z.enum(['user', 'admin']).default('user'),
      status: z.enum(['active', 'disabled']).default('active'),
    }),
  ),
  asyncHandler(async (req, res) => {
    if (await User.exists({ username: req.body.username })) {
      throw new AppError('That username is already in use', 409);
    }
    const user = await User.create({ ...req.body, emailVerified: false });
    res.status(201).json({ status: 'success', data: { user: publicUser(user) } });
  }),
);

router.patch(
  '/users/:id',
  validate(z.object({ id: objectId }), 'params'),
  validate(
    z.object({
      name: name.optional(),
      username: username.optional(),
      email: z.union([email, z.literal(''), z.null()]).optional(),
      password: password.optional(),
      role: z.enum(['user', 'admin']).optional(),
      status: z.enum(['active', 'disabled']).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError('User not found', 404);

    const isSelf = String(user._id) === String(req.user._id);
    if (isSelf && (req.body.role === 'user' || req.body.status === 'disabled')) {
      throw new AppError('You cannot demote or disable your own account', 400);
    }

    const { email: newEmail, password: newPassword, ...rest } = req.body;
    Object.assign(user, rest);
    if (newEmail !== undefined) {
      if (!newEmail) user.email = null;
      else if (newEmail !== user.email) {
        user.email = newEmail;
        user.emailVerified = false;
      }
    }
    if (newPassword) user.password = newPassword;
    await user.save();
    res.json({ status: 'success', data: { user: publicUser(user) } });
  }),
);

// Delete a user and everything they own. Postgres cascades on the foreign keys;
// Mongo and Sheets do not, so the dependent rows are removed explicitly first.
router.delete(
  '/users/:id',
  validate(z.object({ id: objectId }), 'params'),
  asyncHandler(async (req, res) => {
    if (String(req.user._id) === String(req.params.id)) {
      throw new AppError('You cannot delete your own account', 400);
    }
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError('User not found', 404);
    const id = user._id;

    await Post.deleteMany({ author: id });
    await StoryView.deleteMany({ viewer: id });
    for (const story of await Story.find({ author: id }).lean()) {
      await StoryView.deleteMany({ story: story._id });
    }
    await Story.deleteMany({ author: id });

    const convo = await Conversation.findOne({ user: id });
    if (convo) {
      await Message.deleteMany({ conversation: convo._id });
      await convo.deleteOne();
    }

    for (const peer of await PeerConversation.find({ $or: [{ userA: id }, { userB: id }] }).lean()) {
      await PeerMessage.deleteMany({ conversation: peer._id });
    }
    await PeerConversation.deleteMany({ $or: [{ userA: id }, { userB: id }] });

    for (const group of await Group.find({ createdBy: id }).lean()) {
      await GroupMessage.deleteMany({ group: group._id });
    }
    await Group.deleteMany({ createdBy: id });

    await user.deleteOne();
    res.status(204).end();
  }),
);

export default router;
