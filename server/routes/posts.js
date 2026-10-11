import { Router } from 'express';
import { z } from 'zod';
import { optionalAuth, protect } from '../middleware/auth.js';
import { postLimiter } from '../middleware/rateLimit.js';
import { objectId, validate } from '../middleware/validate.js';
import { Post } from '../models/Post.js';
import { AppError, asyncHandler } from '../utils/AppError.js';

const router = Router();

// Documents come back as full documents (so populate works across all three
// datastores); shapePost only needs a plain object.
const plain = (doc) => (typeof doc.toObject === 'function' ? doc.toObject() : doc);

const shapePost = (p, userId) => {
  const author = p.author && typeof p.author === 'object' ? p.author : { _id: p.author };
  const likes = Array.isArray(p.likes) ? p.likes : [];
  return {
    _id: p._id,
    body: p.body,
    author: { _id: author._id, name: author.name ?? '', username: author.username ?? '', avatar: author.avatar ?? null },
    likes: likes.length,
    likedByMe: userId ? likes.some((l) => String(l) === String(userId)) : false,
    mine: userId && author._id ? String(author._id) === String(userId) : false,
    hidden: Boolean(p.hidden),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
};

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  mine: z.coerce.boolean().default(false),
  author: objectId.optional(),
});

// Public feed. `mine` narrows it to the signed-in author; `author` shows one
// person's thoughts on their profile; hidden posts are only visible to admins.
router.get(
  '/',
  optionalAuth,
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const { page, limit, mine, author } = req.validated.query;
    const isAdmin = req.user?.role === 'admin';
    if (mine && !req.user) throw new AppError('Log in to see your posts', 401);

    const filter = {};
    if (!isAdmin) filter.hidden = false;
    if (mine) filter.author = req.user._id;
    else if (author) filter.author = author;

    const [posts, total] = await Promise.all([
      Post.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('author', 'name username avatar')
        .lean(),
      Post.countDocuments(filter),
    ]);

    res.set('Cache-Control', 'no-store');
    res.json({
      status: 'success',
      results: posts.length,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      data: { posts: posts.map((p) => shapePost(p, req.user?._id)) },
    });
  }),
);

const postBody = z.object({ body: z.string().trim().min(1, 'Write something first').max(2000, 'Keep it under 2000 characters') });

router.post(
  '/',
  protect,
  postLimiter,
  validate(postBody),
  asyncHandler(async (req, res) => {
    const post = await Post.create({ author: req.user._id, body: req.body.body, likes: [], hidden: false });
    await post.populate('author', 'name username avatar');
    res.status(201).json({ status: 'success', data: { post: shapePost(plain(post), req.user._id) } });
  }),
);

router.patch(
  '/:id',
  protect,
  validate(z.object({ id: objectId }), 'params'),
  validate(
    z.object({
      body: z.string().trim().min(1).max(2000).optional(),
      hidden: z.boolean().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const post = await Post.findById(req.params.id);
    if (!post) throw new AppError('Post not found', 404);
    const isOwner = String(post.author) === String(req.user._id);
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) throw new AppError('You can only edit your own posts', 403);

    if (req.body.body !== undefined) post.body = req.body.body;
    if (req.body.hidden !== undefined) {
      if (!isAdmin) throw new AppError('Only an admin can hide a post', 403);
      post.hidden = req.body.hidden;
    }
    await post.save();
    await post.populate('author', 'name username avatar');
    res.json({ status: 'success', data: { post: shapePost(plain(post), req.user._id) } });
  }),
);

router.delete(
  '/:id',
  protect,
  validate(z.object({ id: objectId }), 'params'),
  asyncHandler(async (req, res) => {
    const post = await Post.findById(req.params.id);
    if (!post) throw new AppError('Post not found', 404);
    const isOwner = String(post.author) === String(req.user._id);
    if (!isOwner && req.user.role !== 'admin') throw new AppError('You can only delete your own posts', 403);
    await post.deleteOne();
    res.status(204).end();
  }),
);

router.post(
  '/:id/like',
  protect,
  validate(z.object({ id: objectId }), 'params'),
  asyncHandler(async (req, res) => {
    const post = await Post.findById(req.params.id);
    if (!post) throw new AppError('Post not found', 404);
    const likes = Array.isArray(post.likes) ? [...post.likes] : [];
    const idx = likes.findIndex((l) => String(l) === String(req.user._id));
    if (idx === -1) likes.push(req.user._id);
    else likes.splice(idx, 1);
    post.likes = likes;
    await post.save();
    await post.populate('author', 'name username avatar');
    res.json({ status: 'success', data: { post: shapePost(plain(post), req.user._id) } });
  }),
);

// Admin moderation: hide/unhide is available through PATCH above, guarded by role.

export default router;
