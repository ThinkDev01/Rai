import rateLimit from 'express-rate-limit';
import type { ApiResponse } from '../types/common.types';

// Global API rate limit per IP. The original 100/15min was way too tight - a
// normal session (dashboard + a few navigations + the layout's continuous
// Cognito write on slug changes + visibility re-hydrates) blows past it.
//
// 1500/15min ≈ 100/min on average, which comfortably covers active use while
// still protecting against runaway loops or abuse. Tests bypass the limit
// entirely.
//
// Future v3 work: per-route limits (tighter on /auth/* signin/signup, looser
// on read endpoints). Tracked in upgrades.md if needed.
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env['NODE_ENV'] === 'test' ? 10000 : 1500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    data: {},
    error: 'Too many requests - please try again in 15 minutes',
  } satisfies ApiResponse,
});
