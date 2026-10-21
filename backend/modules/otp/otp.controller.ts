import type { Response } from 'express';
import logger from '../../config/logger';
import type { AuthenticatedRequest, ApiResponse } from '../../types/common.types';
import { requestActionOtp } from './otp.service';
import { isOtpAction } from './otp.types';

const ROUTE = '/api/v1/otp/request';

/**
 * POST /api/v1/otp/request — mint + email a 6-digit code for a sensitive action.
 * Body: { action: OtpAction, targetId: string }.
 *
 * The code always goes to the *caller's own* verified email (req.user.email), so
 * we don't authorize the action itself here — that gate lives on the execution
 * endpoint (delete org / transfer / delete project), which re-verifies the code
 * AND the caller's role. Worst case a user mints a code for something they can't
 * do; it's useless without passing the execution endpoint's role check.
 */
export async function requestOtpHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const email  = req.user!.email;
  const { action, targetId } = (req.body ?? {}) as { action?: unknown; targetId?: unknown };

  logger.info({ route: ROUTE, method: 'POST', userId, action, targetId }, 'Request action OTP - start');

  if (!isOtpAction(action)) {
    logger.warn({ route: ROUTE, userId, action }, 'Reject - unknown action');
    res.status(400).json({ success: false, data: {}, error: 'Unknown action' } satisfies ApiResponse);
    return;
  }
  const target = typeof targetId === 'string' && targetId.trim() ? targetId.trim() : null;
  if (!target) {
    logger.warn({ route: ROUTE, userId, action }, 'Reject - targetId missing');
    res.status(400).json({ success: false, data: {}, error: 'targetId is required' } satisfies ApiResponse);
    return;
  }

  try {
    await requestActionOtp(userId, email, action, target);
    logger.info({ route: ROUTE, userId, action, targetId: target }, 'Request action OTP - code emailed');
    res.status(200).json({ success: true, data: {}, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error(
      { route: ROUTE, userId, action, targetId: target, error: (err as Error).message },
      'Request action OTP - failed to send code',
    );
    res.status(500).json({
      success: false, data: {},
      error: 'Could not send the verification code — please try again',
    } satisfies ApiResponse);
  }
}
