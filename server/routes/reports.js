import { Router } from 'express';
import { z } from 'zod';
import { protect } from '../middleware/auth.js';
import { reportLimiter } from '../middleware/rateLimit.js';
import { objectId, validate } from '../middleware/validate.js';
import { Post } from '../models/Post.js';
import { Report, REPORT_KINDS, REPORT_REASONS } from '../models/Report.js';
import { Story } from '../models/Story.js';
import { User } from '../models/User.js';
import { AppError, asyncHandler } from '../utils/AppError.js';

// Student-facing reporting: any signed-in account can flag a thought, a story or
// another person. Admins read and triage the queue through /admin/reports.

const router = Router();
router.use(protect);

const plain = (doc) => (typeof doc.toObject === 'function' ? doc.toObject() : doc);
const idOf = (value) => (value && typeof value === 'object' ? value._id : value);

// Resolve the reported row so the report carries a readable label and so we can
// reject a report for something that no longer exists.
async function resolveTarget(kind, targetId) {
  if (kind === 'post') {
    const post = await Post.findById(targetId).lean();
    if (!post) throw new AppError('That thought no longer exists', 404);
    return { label: String(post.body ?? '').slice(0, 200), authorId: idOf(post.author) };
  }
  if (kind === 'story') {
    const story = await Story.findById(targetId).lean();
    if (!story) throw new AppError('That story no longer exists', 404);
    return { label: (story.caption ? `Story: ${story.caption}` : 'Story').slice(0, 200), authorId: idOf(story.author) };
  }
  const user = await User.findById(targetId).lean();
  if (!user) throw new AppError('That account no longer exists', 404);
  return { label: `@${user.username} · ${user.name ?? ''}`.trim(), authorId: idOf(user) };
}

const createBody = z.object({
  kind: z.enum(REPORT_KINDS),
  targetId: objectId,
  reason: z.enum(REPORT_REASONS).default('other'),
  details: z.string().trim().max(1000).optional().default(''),
});

router.post(
  '/',
  reportLimiter,
  validate(createBody),
  asyncHandler(async (req, res) => {
    const { kind, targetId, reason, details } = req.body;
    if (String(targetId) === String(req.user._id)) {
      throw new AppError('You cannot report yourself', 400);
    }
    const { label } = await resolveTarget(kind, targetId);

    const duplicate = await Report.exists({ reporter: req.user._id, kind, targetId, status: 'open' });
    if (duplicate) throw new AppError('You have already reported this. An admin will review it.', 409);

    const report = await Report.create({
      reporter: req.user._id,
      reporterName: req.user.name ?? '',
      kind,
      targetId,
      targetLabel: label,
      reason,
      details: details ?? '',
      status: 'open',
    });
    res.status(201).json({ status: 'success', data: { report: plain(report) } });
  }),
);

export default router;
