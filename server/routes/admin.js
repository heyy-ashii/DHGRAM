import { Router } from 'express';
import { z } from 'zod';
import { protect, restrictTo } from '../middleware/auth.js';
import { email, name, objectId, password, username, validate } from '../middleware/validate.js';
import { Conversation, Message } from '../models/Chat.js';
import { Group, GroupMessage } from '../models/GroupChat.js';
import { PeerConversation, PeerMessage } from '../models/PeerChat.js';
import { Post } from '../models/Post.js';
import { Report, REPORT_KINDS } from '../models/Report.js';
import { Story, StoryView } from '../models/Story.js';
import { User } from '../models/User.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import { isSuspended } from '../utils/suspension.js';

// Admin-only management API, mounted at /api/v1/admin. The support inbox itself
// lives on the chat routes (/chat/conversations*, guarded by restrictTo('admin'));
// this router covers the dashboard counters and user administration.
const router = Router();
router.use(protect, restrictTo('admin'));

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const publicUser = (u) => {
  const base =
    u && typeof u.toPublicJSON === 'function'
      ? u.toPublicJSON()
      : {
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
        };
  // A clear, UI-friendly state on top of the raw status.
  return {
    ...base,
    suspension: isSuspended(u) ? 'suspended' : u.status === 'disabled' ? 'dismissed' : 'active',
  };
};

router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const [users, admins, disabled, suspended, openReports, openChats, unread] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ status: 'disabled' }),
      User.countDocuments({ status: 'disabled', suspendedUntil: { $gt: new Date() } }),
      Report.countDocuments({ status: 'open' }),
      Conversation.countDocuments({ status: 'open' }),
      Conversation.aggregate([{ $group: { _id: null, total: { $sum: '$unreadForAdmin' } } }]),
    ]);
    res.json({
      status: 'success',
      data: { users, admins, disabled, suspended, openReports, openChats, unreadMessages: unread[0]?.total ?? 0 },
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
      // The action shorthand is a convenience over status + suspendedUntil.
      action: z.enum(['suspend', 'dismiss', 'reinstate']).optional(),
      suspendUntil: z.coerce.date().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError('User not found', 404);

    const isSelf = String(user._id) === String(req.user._id);
    const { action, suspendUntil, email: newEmail, password: newPassword, ...rest } = req.body;
    const wantsDisabled = action === 'suspend' || action === 'dismiss' || rest.status === 'disabled';
    if (isSelf && (rest.role === 'user' || wantsDisabled)) {
      throw new AppError('You cannot demote or disable your own account', 400);
    }

    // A suspension is status='disabled' plus a future suspendedUntil that the auth
    // layer lifts on its own; a dismissal is the same with no end time. Reinstating
    // clears both. A bare `status` update stays supported for older callers.
    if (action === 'suspend') {
      if (!suspendUntil || suspendUntil.getTime() <= Date.now()) {
        throw new AppError('Choose a suspension end time in the future', 400);
      }
      user.status = 'disabled';
      user.suspendedUntil = suspendUntil;
    } else if (action === 'dismiss') {
      user.status = 'disabled';
      user.suspendedUntil = null;
    } else if (action === 'reinstate') {
      user.status = 'active';
      user.suspendedUntil = null;
    } else if (rest.status !== undefined) {
      // A bare status update (no action) still works and clears any suspension.
      user.status = rest.status;
      user.suspendedUntil = null;
    }
    delete rest.status;

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

// ---------------------------------------------------------------------------
// Support inbox: the full student directory
// ---------------------------------------------------------------------------

// Unlike GET /chat/conversations (only students who wrote in), this lists every
// student so an admin can open a support thread with anyone. Each row carries its
// conversation state when one exists. `unanswered` narrows to students with no
// thread yet.
const supportDirectoryQuery = z.object({
  q: z.string().trim().max(100).optional(),
  unanswered: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

router.get(
  '/support/directory',
  validate(supportDirectoryQuery, 'query'),
  asyncHandler(async (req, res) => {
    const { q, unanswered, page, limit } = req.validated.query;
    const filter = { role: 'user' };
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ name: rx }, { username: rx }, { regNo: rx }];
    }
    const students = await User.find(filter).sort({ name: 1 }).lean();

    // One conversation per student (unique `user`), so this is a simple map.
    const conversations = await Conversation.find({ user: { $in: students.map((s) => s._id) } }).lean();
    const byUser = new Map(conversations.map((c) => [String(c.user), c]));

    let rows = students.map((s) => {
      const c = byUser.get(String(s._id));
      return {
        _id: s._id,
        name: s.name ?? '',
        username: s.username ?? '',
        regNo: s.regNo ?? null,
        avatar: s.avatar ?? null,
        conversationId: c?._id ?? null,
        status: c?.status ?? null,
        lastMessage: c?.lastMessage ?? '',
        lastMessageAt: c?.lastMessageAt ?? null,
        unreadForAdmin: c?.unreadForAdmin ?? 0,
      };
    });
    if (unanswered === 'true') rows = rows.filter((r) => !r.conversationId);

    const total = rows.length;
    const start = (page - 1) * limit;
    res.set('Cache-Control', 'no-store');
    res.json({
      status: 'success',
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      data: { students: rows.slice(start, start + limit) },
    });
  }),
);

// Open (or reopen) a support thread with a student picked from the directory.
router.post(
  '/support/conversations',
  validate(z.object({ userId: objectId })),
  asyncHandler(async (req, res) => {
    const student = await User.findById(req.body.userId);
    if (!student || student.role !== 'user') throw new AppError('That account is not available', 404);
    const conversation =
      (await Conversation.findOne({ user: student._id })) || (await Conversation.create({ user: student._id }));
    await conversation.populate('user', 'name username email');
    res.status(201).json({ status: 'success', data: { conversation } });
  }),
);

// ---------------------------------------------------------------------------
// Reports queue
// ---------------------------------------------------------------------------

const reportQuery = z.object({
  status: z.enum(['open', 'resolved', 'dismissed', 'all']).default('open'),
  kind: z.enum(REPORT_KINDS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.get(
  '/reports',
  validate(reportQuery, 'query'),
  asyncHandler(async (req, res) => {
    const { status, kind, page, limit } = req.validated.query;
    const filter = {};
    if (status !== 'all') filter.status = status;
    if (kind) filter.kind = kind;
    const [reports, total] = await Promise.all([
      Report.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Report.countDocuments(filter),
    ]);

    // Resolve the account behind each report so an admin can act on the offender
    // without leaving the queue. The author of a reported post/story is looked up
    // in a couple of batched queries; a reported user is the target itself.
    const postIds = reports.filter((r) => r.kind === 'post').map((r) => r.targetId);
    const storyIds = reports.filter((r) => r.kind === 'story').map((r) => r.targetId);
    const [posts, stories] = await Promise.all([
      postIds.length ? Post.find({ _id: { $in: postIds } }).lean() : [],
      storyIds.length ? Story.find({ _id: { $in: storyIds } }).lean() : [],
    ]);
    const authorOf = new Map();
    for (const p of posts) authorOf.set(String(p._id), String(p.author));
    for (const s of stories) authorOf.set(String(s._id), String(s.author));
    const authorIds = [
      ...new Set([
        ...authorOf.values(),
        ...reports.filter((r) => r.kind === 'user').map((r) => String(r.targetId)),
      ]),
    ];
    const authors = authorIds.length ? await User.find({ _id: { $in: authorIds } }).select('name username').lean() : [];
    const authorById = new Map(authors.map((u) => [String(u._id), u]));

    res.json({
      status: 'success',
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      data: {
        reports: reports.map((r) => {
          // A reported user is the target itself; otherwise the target row's author.
          const authorId = r.kind === 'user' ? String(r.targetId) : authorOf.get(String(r.targetId));
          const author = authorById.get(authorId);
          return {
            ...r,
            targetAuthor: author ? { _id: author._id, name: author.name ?? '', username: author.username ?? '' } : null,
          };
        }),
      },
    });
  }),
);

// Resolve a report: optionally remove the content it points at. A reported user
// is dealt with through the suspend/dismiss flow on the users endpoint instead.
router.patch(
  '/reports/:id',
  validate(z.object({ id: objectId }), 'params'),
  validate(
    z.object({
      action: z.enum(['resolve', 'dismiss']),
      removeContent: z.boolean().optional().default(false),
    }),
  ),
  asyncHandler(async (req, res) => {
    const report = await Report.findById(req.params.id);
    if (!report) throw new AppError('Report not found', 404);
    if (report.status !== 'open') throw new AppError('That report has already been handled', 400);

    if (req.body.removeContent && report.kind === 'post') {
      await Post.deleteMany({ _id: report.targetId });
    } else if (req.body.removeContent && report.kind === 'story') {
      await StoryView.deleteMany({ story: report.targetId });
      await Story.deleteMany({ _id: report.targetId });
    }

    report.status = req.body.action === 'dismiss' ? 'dismissed' : 'resolved';
    report.handledBy = req.user._id;
    report.handledAt = new Date();
    await report.save();
    res.json({
      status: 'success',
      data: { report: typeof report.toObject === 'function' ? report.toObject() : report },
    });
  }),
);

// ---------------------------------------------------------------------------
// Thoughts (posts) moderation
// ---------------------------------------------------------------------------

const postFilterQuery = z.object({
  q: z.string().trim().max(100).optional(),
  hidden: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.get(
  '/posts',
  validate(postFilterQuery, 'query'),
  asyncHandler(async (req, res) => {
    const { q, hidden, page, limit } = req.validated.query;
    const filter = {};
    if (hidden) filter.hidden = hidden === 'true';
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      // Authors are matched by name/username too, so a search for a student shows
      // every thought they wrote. The author ids are resolved first because a
      // joined/embedded filter is not portable across the three datastores.
      const authors = await User.find({ $or: [{ name: rx }, { username: rx }] })
        .select('_id')
        .lean();
      const ids = authors.map((a) => a._id);
      filter.$or = ids.length ? [{ body: rx }, { author: { $in: ids } }] : [{ body: rx }];
    }
    const [posts, total] = await Promise.all([
      Post.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('author', 'name username avatar')
        .lean(),
      Post.countDocuments(filter),
    ]);
    res.json({
      status: 'success',
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      data: {
        posts: posts.map((p) => {
          const author = p.author && typeof p.author === 'object' ? p.author : { _id: p.author };
          const likes = Array.isArray(p.likes) ? p.likes : [];
          return {
            _id: p._id,
            body: p.body,
            author: { _id: author._id, name: author.name ?? '', username: author.username ?? '', avatar: author.avatar ?? null },
            likes: likes.length,
            hidden: Boolean(p.hidden),
            createdAt: p.createdAt,
          };
        }),
      },
    });
  }),
);

export default router;
