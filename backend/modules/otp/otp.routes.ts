import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requestOtpHandler } from './otp.controller';
import type { ApiResponse } from '../../types/common.types';

// Dedicated tight limiter — every request sends a real email, so this endpoint
// is the natural target for an email-bomb. 5 sends / 10 min per IP is plenty for
// a human confirming an action (including a resend or two) while capping abuse.
// Sits BEFORE authMiddleware so abusive traffic is shed before any DB/JWT work;
// keyed by IP for the same reason (the user isn't known pre-auth). Tests bypass.
const otpRequestLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: process.env['NODE_ENV'] === 'test' ? 10000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    data: {},
    error: 'Too many code requests — please wait a few minutes',
  } satisfies ApiResponse,
});

const router = Router();

// POST /api/v1/otp/request — mint + email a 6-digit code for a sensitive action.
router.post('/request', otpRequestLimiter, authMiddleware, requestOtpHandler);

export default router;
