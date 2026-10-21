import type { Response } from 'express';
import logger from '../../config/logger';
import type { AuthenticatedRequest, ApiResponse } from '../../types/common.types';
import { sendEmail } from '../email/email.service';
import { insertFeedback } from './feedback.model';
import { FEEDBACK_TITLE_MAX, FEEDBACK_BODY_MIN, FEEDBACK_BODY_MAX } from './feedback.types';
import { feedbackEmail } from './templates/feedback.template';

const ROUTE = 'feedback.controller';

// Where feedback lands. SUPPORT_EMAIL if set, else the verified SES sender, else
// the systems mailbox (reference_novetum_role_mailboxes — systems@ owns admin SaaS).
const SUPPORT_EMAIL =
  (process.env['SUPPORT_EMAIL'] ?? '').trim() ||
  'support@rai.novetum.com';

// POST /api/v1/feedback { title, body } — store + email support. Auth only (no
// org gate) so it works from any page; org context is best-effort.
export async function submitFeedback(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;
  const email  = req.user!.email;
  const name   = req.user!.name;
  const orgId  = req.user!.currentOrgId ?? null;
  const { title, body } = req.body as { title?: unknown; body?: unknown };

  if (typeof title !== 'string' || !title.trim() || title.trim().length > FEEDBACK_TITLE_MAX) {
    res.status(400).json({ success: false, data: {}, error: `Title is required (max ${FEEDBACK_TITLE_MAX} characters)` } satisfies ApiResponse);
    return;
  }
  if (typeof body !== 'string' || body.trim().length < FEEDBACK_BODY_MIN || body.trim().length > FEEDBACK_BODY_MAX) {
    res.status(400).json({ success: false, data: {}, error: `Please write a bit more (${FEEDBACK_BODY_MIN}-${FEEDBACK_BODY_MAX} characters)` } satisfies ApiResponse);
    return;
  }

  const t = title.trim();
  const b = body.trim();

  try {
    logger.info({ route: ROUTE, method: 'POST', userId, orgId }, 'Feedback submit - start');
    await insertFeedback(userId, orgId, t, b);

    // Email support — best-effort. The DB row is the source of truth; an SES
    // hiccup must not fail the user's submission.
    try {
      const { subject, textBody, htmlBody } = feedbackEmail({
        title: t,
        body: b,
        submitterEmail: email,
        submitterName: name,
      });
      await sendEmail({ to: SUPPORT_EMAIL, subject, textBody, htmlBody });
    } catch (mailErr) {
      logger.warn({ route: ROUTE, userId, error: (mailErr as Error).message }, 'Feedback email to support failed - stored in DB anyway');
    }

    res.status(201).json({ success: true, data: {}, error: '' } satisfies ApiResponse);
  } catch (err) {
    logger.error({ route: ROUTE, userId, error: (err as Error).message }, 'Feedback submit failed');
    res.status(500).json({ success: false, data: {}, error: 'Could not submit feedback' } satisfies ApiResponse);
  }
}
