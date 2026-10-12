import { config } from '../config.js';
import { User } from '../models/User.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import { liftIfExpired } from '../utils/suspension.js';
import { verifyToken } from '../utils/tokens.js';

function readToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.[config.cookieName];
}

async function resolveUser(req) {
  const token = readToken(req);
  if (!token) return null;
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return null;
  }
  const user = await User.findById(payload.sub);
  if (!user) return null;
  if (user.status !== 'active') {
    // A temporary suspension lifts itself the moment it runs out.
    const lifted = await liftIfExpired(user);
    if (!lifted) return null;
  }
  if (user.changedPasswordAfter(payload.iat)) return null;
  return user;
}

export const protect = asyncHandler(async (req, _res, next) => {
  const user = await resolveUser(req);
  if (!user) throw new AppError('You are not logged in! Please log in to get access.', 401);
  req.user = user;
  next();
});

export const optionalAuth = asyncHandler(async (req, _res, next) => {
  req.user = await resolveUser(req);
  next();
});

export const restrictTo =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action.', 403));
    }
    next();
  };
