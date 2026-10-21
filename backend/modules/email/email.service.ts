// Resend-backed transactional email. Single sender, subject + body differentiate
// (Slack/Linear pattern — one mailbox). Free tier (100 emails/day) is plenty for
// dev; swap the provider behind this function later without touching callers.
//
// Sender fallback: if the primary RESEND_FROM_EMAIL send fails (e.g. the domain
// isn't verified in Resend yet), the email is retried ONCE from
// RESEND_FALLBACK_FROM_EMAIL (default: Resend's built-in onboarding@resend.dev,
// which always works). Logs which sender delivered. Set
// RESEND_FALLBACK_FROM_EMAIL= to disable the fallback.
//
// Deliberately assert config at SEND time (not boot) so the backend still starts
// in environments where email is disabled (e.g. CI test runs).

import logger from '../../config/logger';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const apiKey = process.env['RESEND_API_KEY'];
const fromEmail = process.env['RESEND_FROM_EMAIL'] ?? process.env['SES_FROM_EMAIL'];
const fallbackFromEmail = process.env['RESEND_FALLBACK_FROM_EMAIL'] ?? 'onboarding@resend.dev';

export interface SendEmailParams {
  to:        string;
  subject:   string;
  textBody:  string;
  /** Plain-text-first per standards.md. HTML optional and never relied upon. */
  htmlBody?: string;
}

/** One Resend API call. Throws on non-2xx. */
async function resendSend(
  from: string,
  params: SendEmailParams,
): Promise<string> {
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      text: params.textBody,
      ...(params.htmlBody ? { html: params.htmlBody } : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend returned ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as { id?: string };
  return data.id ?? '';
}

/**
 * Send a transactional email via Resend. Primary sender first; on failure,
 * retry once from the fallback sender (see header). Logs both attempts.
 * Failed sends throw; the caller decides whether that's fatal (invites swallow
 * + toast, auth flows propagate).
 */
export async function sendEmail(params: SendEmailParams): Promise<{ messageId: string }> {
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  if (!fromEmail) {
    throw new Error('RESEND_FROM_EMAIL is not configured');
  }

  const startedAt = Date.now();
  logger.info(
    { op: 'sendEmail', to: params.to, subject: params.subject, from: fromEmail, route: 'email.service' },
    'Resend send - start',
  );

  try {
    const messageId = await resendSend(fromEmail, params);
    const ms = Date.now() - startedAt;
    logger.info(
      { op: 'sendEmail', to: params.to, ms, messageId, from: fromEmail, route: 'email.service' },
      'Resend send - success',
    );
    return { messageId };
  } catch (primaryErr) {
    const ms = Date.now() - startedAt;
    logger.error(
      { op: 'sendEmail', to: params.to, ms, from: fromEmail, error: (primaryErr as Error).message, route: 'email.service' },
      'Resend send - failed (primary sender)',
    );

    // Backup strategy: retry once from the always-works fallback sender.
    if (!fallbackFromEmail) throw primaryErr;
    logger.info(
      { op: 'sendEmail', to: params.to, from: fallbackFromEmail, route: 'email.service' },
      'Resend send - retrying with fallback sender',
    );
    try {
      const messageId = await resendSend(fallbackFromEmail, params);
      const ms2 = Date.now() - startedAt;
      logger.info(
        { op: 'sendEmail', to: params.to, ms: ms2, messageId, from: fallbackFromEmail, route: 'email.service' },
        'Resend send - success via fallback sender',
      );
      return { messageId };
    } catch (fallbackErr) {
      const ms2 = Date.now() - startedAt;
      logger.error(
        { op: 'sendEmail', to: params.to, ms: ms2, from: fallbackFromEmail, error: (fallbackErr as Error).message, route: 'email.service' },
        'Resend send - failed (fallback sender too)',
      );
      throw primaryErr;
    }
  }
}