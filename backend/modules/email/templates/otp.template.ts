// Plain-text-first OTP email per docs/notifications.md. The code is the payload;
// the action label ("...to delete your organization") tells the user exactly
// what they're authorizing so a phished/unexpected code is easy to spot.
//
// HTML uses the shared branded shell (renderEmail) — same R-logo header, footer
// and colours as every other Rai email — with the code in the centered code slot.
import { renderEmail } from '../../notifications/templates/layout';

export interface OtpTemplateParams {
  code:             string;
  /** Human phrasing of the action, e.g. "delete your organization". */
  actionLabel:      string;
  expiresInMinutes: number;
}

export function otpEmail(p: OtpTemplateParams): {
  subject:  string;
  textBody: string;
  htmlBody: string;
} {
  const subject = `Your Rai verification code: ${p.code}`;

  const textBody = [
    `Hi,`,
    ``,
    `Use this code to confirm that you want to ${p.actionLabel}:`,
    ``,
    `    ${p.code}`,
    ``,
    `The code expires in ${p.expiresInMinutes} minutes and can be used once.`,
    `If you didn't request this, you can safely ignore this email — nothing will change.`,
    ``,
    `- The Rai team`,
  ].join('\n');

  // No CTA — the code is the payload; the user types it back into the app.
  const htmlBody = renderEmail({
    heading:  `Your verification code`,
    body:     [`Use this code to confirm that you want to **${p.actionLabel}**:`],
    code:     p.code,
    footnote: [
      `The code expires in ${p.expiresInMinutes} minutes and can be used once.`,
      `If you didn't request this, you can safely ignore this email — nothing will change.`,
    ],
  });

  return { subject, textBody, htmlBody };
}
