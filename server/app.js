import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { config, datastore } from './config.js';
import { connectDB } from './db.js';
import { errorHandler, notFound } from './middleware/error.js';
import { apiLimiter } from './middleware/rateLimit.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';
import messageRoutes from './routes/messages.js';
import postRoutes from './routes/posts.js';
import storyRoutes from './routes/stories.js';
import { asyncHandler } from './utils/AppError.js';

export function createApp({ connect = connectDB } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());

  // Frontend and API share one origin on Vercel; cross-origin access is opt-in via CORS_ORIGINS.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && config.corsOrigins.includes(origin)) {
      res.set({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        Vary: 'Origin',
      });
      if (req.method === 'OPTIONS') return res.status(204).end();
    }
    next();
  });

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/v1/health', (_req, res) =>
    res.json({
      status: 'success',
      message: 'DHGRAM API running',
      datastore: datastore(),
    }),
  );

  app.use('/api', apiLimiter);
  // MongoDB is only connected when it is the datastore; Sheets and Supabase
  // connect lazily on first query.
  const ensureStore = datastore() === 'mongo' ? connect : async () => {};
  app.use(
    '/api',
    asyncHandler(async (_req, _res, next) => {
      await ensureStore();
      next();
    }),
  );
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/posts', postRoutes);
  app.use('/api/v1/stories', storyRoutes);
  app.use('/api/v1/messages', messageRoutes);
  app.use('/api/v1/admin', adminRoutes);
  app.use('/api/v1/chat', chatRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

export default createApp();
