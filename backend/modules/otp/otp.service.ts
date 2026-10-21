// Public API of the OTP module — the ONLY surface other modules import from
// (controllers never reach into otp.model directly, mirroring the
// projects.service re-export rule). Two operations:
//   requestActionOtp → mint a code + email it (called by the OTP controller)
//   verifyActionOtp  → gate a sensitive-action endpoint (called by orgs/projects)

import logger from '../../config/logger';
import { sendEmail } from '../email/email.service';
import { otpEmail } from '../email/templates/otp.template';
import { createChallenge, verifyChallenge, OTP_TTL_MINUTES } from './otp.model';
import { OTP_ACTION_LABEL, type OtpAction } from './otp.types';

const ROUTE = 'otp.service';

/**
 * Mint a code for (user, action, target) and email it to the user. Throws if
 * the SES send fails (the controller maps that to a 500 — the challenge row
 * already exists but is harmless without the code reaching the user).
 */
export async function requestActionOtp(
  userId: string,
  email: string,
  action: OtpAction,
  targetId: string | null,
): Promise<void> {
  const code = await createChallenge(userId, action, targetId);
  const { subject, textBody, htmlBody } = otpEmail({
    code,
    actionLabel: OTP_ACTION_LABEL[action],
    expiresInMinutes: OTP_TTL_MINUTES,
  });
  logger.info({ route: ROUTE, userId, action, targetId }, 'OTP challenge minted - emailing code');
  await sendEmail({ to: email, subject, textBody, htmlBody });
}

export interface OtpGuardResult {
  ok: boolean;
  /** HTTP status the controller should send on failure (200 when ok). */
  status: number;
  /** User-facing error message (empty when ok). */
  error: string;
}

/**
 * Verify an OTP supplied to a sensitive-action endpoint and return a
 * ready-to-send { status, error } so every gated controller fails uniformly:
 *   - missing / malformed code        → 400
 *   - wrong / expired / exhausted code → 403  (authenticated, but the action
 *                                              verification failed — NOT 401,
 *                                              which the API client treats as a
 *                                              session-expired → forced logout)
 * On success the underlying challenge is consumed (single-use).
 */
export async function verifyActionOtp(
  userId: string,
  action: OtpAction,
  targetId: string | null,
  code: unknown,
): Promise<OtpGuardResult> {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    return { ok: false, status: 400, error: 'A 6-digit verification code is required' };
  }

  const res = await verifyChallenge(userId, action, targetId, code);
  if (res.ok) return { ok: true, status: 200, error: '' };

  const error =
    res.reason === 'expired'           ? 'Your verification code has expired — request a new one' :
    res.reason === 'too_many_attempts' ? 'Too many incorrect attempts — request a new code' :
    res.reason === 'no_challenge'      ? 'No active code — request a verification code first' :
                                         'Incorrect verification code';
  logger.warn({ route: ROUTE, userId, action, targetId, reason: res.reason }, 'OTP verify - rejected');
  return { ok: false, status: 403, error };
}
