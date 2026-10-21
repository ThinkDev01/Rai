import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../../middleware/authMiddleware';
import { submitFeedback } from './feedback.controller';
import type { ApiResponse } from '../../types/common.types';

// Tight limiter — each submit writes a row + sends a support email. 5 / hour / IP
// is plenty for genuine feedback and caps spam. Tests bypass.
const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env['NODE_ENV'] === 'test' ? 10000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, data: {}, error: 'Too many submissions — please try again later' } satisfies ApiResponse,
});

const router = Router();

// POST /api/v1/feedback — submit feedback (auth only; no org gate, works anywhere).
router.post('/', feedbackLimiter, authMiddleware, submitFeedback);

export default router;
