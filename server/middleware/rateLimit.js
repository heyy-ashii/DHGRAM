import { rateLimit } from 'express-rate-limit';
import { config } from '../config.js';

const make = (windowMinutes, limit, message) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: config.isTest ? 1000 : limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { status: 'fail', message },
  });

export const apiLimiter = make(15, 600, 'Too many requests. Please slow down.');
export const loginLimiter = make(15, 20, 'Too many login attempts. Try again in 15 minutes.');
export const otpLimiter = make(15, 6, 'Too many code requests. Try again in 15 minutes.');
export const chatLimiter = make(1, 20, 'You are sending messages too quickly.');
export const postLimiter = make(1, 10, 'You are posting too quickly.');
export const storyLimiter = make(1, 10, 'You are posting stories too quickly.');
export const reportLimiter = make(1, 15, 'You are reporting too quickly.');
export const chessLimiter = make(1, 60, 'You are moving too quickly.');
export const cronLimiter = make(1, 10, 'Too many cleanup runs.');
