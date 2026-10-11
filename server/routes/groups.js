import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { protect } from '../middleware/auth.js';
import { chatLimiter } from '../middleware/rateLimit.js';
import { objectId, validate } from '../middleware/validate.js';
import { Group, GroupMessage, findGroupsForUser, isMember } from '../models/GroupChat.js';
import { User } from '../models/User.js';
import { AppError, asyncHandler } from '../utils/AppError.js';

// Student group chats. Any signed-in student can start a group and add other
// students; there is no admin and no owner-only powers. Membership lives on the
// group document, so reads stay to a single query on every datastore.
const router = Router();
router.use(protect);

const plain = (doc) => (typeof doc.toObject === 'function' ? doc.toObject() : doc);

const shapeUser = (user) => {
  const u = user && typeof user === 'object' ? user : { _id: user };
  return { _id: u._id, name: u.name ?? '', username: u.username ?? '', avatar: u.avatar ?? null };
};

// Turn a group's member id list into full user records, keeping the stored order.
async function shapeMembers(members) {
  const ids = members.map((m) => (m && typeof m === 'object' ? m._id : m));
  if (!ids.length) return [];
  const users = await User.find({ _id: { $in: ids } }).lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return ids.map((id) => shapeUser(byId.get(String(id)) ?? { _id: id }));
}

async function shapeGroup(group, userId) {
  const members = await shapeMembers(group.members ?? []);
  return {
    _id: group._id,
    name: group.name,
    members,
    memberCount: members.length,
    mine: String(group.createdBy) === String(userId),
    lastMessage: group.lastMessage ?? '',
    lastMessageAt: group.lastMessageAt,
  };
}

const shapeMessage = (m, userId) => ({
  _id: m._id,
  body: m.body,
  sender: m.sender,
  mine: String(m.sender) === String(userId),
  createdAt: m.createdAt,
});

async function purgeOldGroupMessages(group) {
  const cutoff = new Date(Date.now() - config.chat.retentionDays * 24 * 60 * 60 * 1000);
  const removed = await GroupMessage.deleteMany({ group: group._id, createdAt: { $lt: cutoff } });
  if (!removed) return 0;
  const latest = await GroupMessage.findOne({ group: group._id }).sort({ createdAt: -1 }).lean();
  group.lastMessage = latest ? String(latest.body).slice(0, 140) : '';
  if (latest) group.lastMessageAt = latest.createdAt;
  await group.save();
  return removed;
}

async function loadGroup(id, userId) {
  const group = await Group.findById(id);
  if (!group || !isMember(group, userId)) throw new AppError('Group not found', 404);
  return group;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const me = req.user._id;
    const groups = await findGroupsForUser(me);
    const data = await Promise.all(groups.map((g) => shapeGroup(plain(g), me)));
    res.set('Cache-Control', 'no-store');
    res.json({ status: 'success', data: { groups: data } });
  }),
);

const createGroup = z.object({
  name: z.string().trim().min(1).max(80),
  memberIds: z.array(objectId).max(50).default([]),
});

router.post(
  '/',
  validate(createGroup),
  asyncHandler(async (req, res) => {
    const me = String(req.user._id);
    const { name } = req.body;
    // The creator is always a member. Duplicate ids (including the creator) collapse.
    const members = [...new Set([me, ...req.body.memberIds.map(String)])];

    const users = await User.find({ _id: { $in: members }, status: 'active' }).lean();
    if (users.length !== members.length) throw new AppError('One or more members are not available', 400);

    const group = await Group.create({ name, createdBy: me, members });
    res.status(201).json({ status: 'success', data: { group: await shapeGroup(plain(group), me) } });
  }),
);

router.get(
  '/:id',
  validate(z.object({ id: objectId }), 'params'),
  asyncHandler(async (req, res) => {
    const me = req.user._id;
    const group = await loadGroup(req.params.id, me);
    await purgeOldGroupMessages(group);
    const messages = await GroupMessage.find({ group: group._id }).sort({ createdAt: 1 }).limit(200).lean();
    res.set('Cache-Control', 'no-store');
    res.json({
      status: 'success',
      data: {
        group: await shapeGroup(plain(group), me),
        messages: messages.map((m) => shapeMessage(m, me)),
      },
    });
  }),
);

router.post(
  '/:id/messages',
  chatLimiter,
  validate(z.object({ id: objectId }), 'params'),
  validate(z.object({ body: z.string().trim().min(1, 'Message cannot be empty').max(2000) })),
  asyncHandler(async (req, res) => {
    const me = req.user._id;
    const group = await loadGroup(req.params.id, me);
    const message = await GroupMessage.create({ group: group._id, sender: me, body: req.body.body });
    group.lastMessage = req.body.body.slice(0, 140);
    group.lastMessageAt = message.createdAt;
    await group.save();
    res.status(201).json({ status: 'success', data: { message: shapeMessage(plain(message), me) } });
  }),
);

// Add more students to an existing group. Any member can invite.
router.post(
  '/:id/members',
  validate(z.object({ id: objectId }), 'params'),
  validate(z.object({ memberIds: z.array(objectId).min(1).max(50) })),
  asyncHandler(async (req, res) => {
    const me = req.user._id;
    const group = await loadGroup(req.params.id, me);
    const incoming = [...new Set(req.body.memberIds.map(String))];
    const users = await User.find({ _id: { $in: incoming }, status: 'active' }).lean();
    if (users.length !== incoming.length) throw new AppError('One or more members are not available', 400);

    const current = new Set((group.members ?? []).map((m) => String(m)));
    for (const id of incoming) current.add(id);
    group.members = [...current];
    await group.save();
    res.json({ status: 'success', data: { group: await shapeGroup(plain(group), me) } });
  }),
);

// Leave a group. Removing the last member is not allowed; the group is otherwise
// left in place so its history is not destroyed by a single departure.
router.delete(
  '/:id/members/me',
  validate(z.object({ id: objectId }), 'params'),
  asyncHandler(async (req, res) => {
    const me = String(req.user._id);
    const group = await loadGroup(req.params.id, me);
    const remaining = (group.members ?? []).map(String).filter((id) => id !== me);
    if (remaining.length < 1) throw new AppError('A group needs at least one member', 400);
    group.members = remaining;
    await group.save();
    res.status(204).end();
  }),
);

export { purgeOldGroupMessages };

export default router;
