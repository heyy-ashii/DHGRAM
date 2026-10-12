import { Router } from 'express';
import { z } from 'zod';
import { optionalAuth, protect } from '../middleware/auth.js';
import { storyLimiter } from '../middleware/rateLimit.js';
import { objectId, validate } from '../middleware/validate.js';
import { Story, StoryView } from '../models/Story.js';
import { User } from '../models/User.js';
import { AppError, asyncHandler } from '../utils/AppError.js';

// Instagram-style stories: an image that expires after 24 hours. The feed is
// public to read; posting, viewing and deleting require a login.

const router = Router();

const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const cutoff = () => new Date(Date.now() - STORY_TTL_MS);

// Mongo and Postgres both hand back populated authors as objects; the Sheets
// driver does too. shapeAuthor normalises whichever shape arrived.
const shapeAuthor = (value) => {
  const a = value && typeof value === 'object' ? value : { _id: value };
  return { _id: a._id, name: a.name ?? '', username: a.username ?? '', avatar: a.avatar ?? null };
};

const shapeStory = (s, viewerId, seen) => {
  const author = shapeAuthor(s.author);
  return {
    _id: s._id,
    imageUrl: s.imageUrl,
    caption: s.caption ?? '',
    author,
    mine: viewerId ? String(author._id) === String(viewerId) : false,
    seen: Boolean(seen),
    createdAt: s.createdAt,
  };
};

// Stories grouped by author, newest author first, with an unseen flag so the
// client can ring the avatar. Only accounts with at least one live story appear.
router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const stories = await Story.find({ createdAt: { $gte: cutoff() } })
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('author', 'name username avatar')
      .lean();

    const viewerId = req.user?._id;
    const seen = new Set();
    if (viewerId && stories.length) {
      const views = await StoryView.find({ story: { $in: stories.map((s) => s._id) }, viewer: viewerId }).lean();
      for (const v of views) seen.add(String(v.story));
    }

    const grouped = new Map();
    for (const s of stories) {
      const author = shapeAuthor(s.author);
      if (!author._id) continue;
      const key = String(author._id);
      if (!grouped.has(key)) grouped.set(key, { user: author, stories: [] });
      grouped.get(key).stories.push(shapeStory(s, viewerId, seen.has(String(s._id))));
    }

    res.set('Cache-Control', 'no-store');
    res.json({
      status: 'success',
      data: {
        groups: [...grouped.values()].map((g) => ({
          user: g.user,
          unseen: g.stories.some((s) => !s.seen),
          stories: g.stories,
        })),
      },
    });
  }),
);

// The signed-in student's own live stories, so the profile and the "add story"
// ring know whether they have something up.
router.get(
  '/mine',
  protect,
  asyncHandler(async (req, res) => {
    const stories = await Story.find({ author: req.user._id, createdAt: { $gte: cutoff() } })
      .sort({ createdAt: -1 })
      .lean();
    res.set('Cache-Control', 'no-store');
    res.json({ status: 'success', data: { stories: stories.map((s) => shapeStory(s, req.user._id)) } });
  }),
);

const createBody = z.object({
  // Data URL. ~1.4 MB caps the JSON body while leaving room for a compressed image.
  imageUrl: z.string().trim().min(1, 'Choose an image').max(1_500_000, 'That image is too large'),
  caption: z.string().trim().max(280).optional().default(''),
});

router.post(
  '/',
  protect,
  storyLimiter,
  validate(createBody),
  asyncHandler(async (req, res) => {
    const story = await Story.create({
      author: req.user._id,
      imageUrl: req.body.imageUrl,
      caption: req.body.caption ?? '',
    });
    await story.populate('author', 'name username avatar');
    res.status(201).json({ status: 'success', data: { story: shapeStory(story, req.user._id, false) } });
  }),
);

router.delete(
  '/:id',
  protect,
  validate(z.object({ id: objectId }), 'params'),
  asyncHandler(async (req, res) => {
    const story = await Story.findById(req.params.id);
    if (!story) throw new AppError('Story not found', 404);
    const isOwner = String(story.author) === String(req.user._id);
    if (!isOwner && req.user.role !== 'admin') throw new AppError('You can only delete your own story', 403);
    await StoryView.deleteMany({ story: story._id });
    await story.deleteOne();
    res.status(204).end();
  }),
);

// Record a view. Idempotent: viewing the same story twice keeps one row.
router.post(
  '/:id/view',
  protect,
  validate(z.object({ id: objectId }), 'params'),
  asyncHandler(async (req, res) => {
    const story = await Story.findById(req.params.id);
    if (!story) throw new AppError('Story not found', 404);
    if (String(story.author) === String(req.user._id)) return res.json({ status: 'success' });
    await StoryView.findOneAndUpdate(
      { story: story._id, viewer: req.user._id },
      {},
      { upsert: true },
    );
    res.json({ status: 'success' });
  }),
);

// Who watched one of my stories. Only the author (or an admin) may look.
router.get(
  '/:id/viewers',
  protect,
  validate(z.object({ id: objectId }), 'params'),
  asyncHandler(async (req, res) => {
    const story = await Story.findById(req.params.id);
    if (!story) throw new AppError('Story not found', 404);
    if (String(story.author) !== String(req.user._id) && req.user.role !== 'admin') {
      throw new AppError('Only the author can see who viewed a story', 403);
    }
    const views = await StoryView.find({ story: story._id }).sort({ createdAt: -1 }).lean();
    const ids = [...new Set(views.map((v) => String(v.viewer)))];
    const users = ids.length ? await User.find({ _id: { $in: ids } }).lean() : [];
    const byId = new Map(users.map((u) => [String(u._id), u]));
    res.json({
      status: 'success',
      data: {
        viewers: ids.map((id) => shapeAuthor(byId.get(id) ?? { _id: id })),
      },
    });
  }),
);

export default router;
