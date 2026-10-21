// Plain-text-first feedback-notification template per docs/notifications.md.
// HTML uses the shared branded email shell (renderEmail) so it matches the
// OTP/invite emails and the product UI. Leads with who submitted it, then the
// title and message — no org metadata.
import { renderEmail } from '../../notifications/templates/layout';

export interface FeedbackTemplateParams {
  title:          string;
  body:           string;
  submitterEmail: string;
  /** Display name. Null for federated users whose IdP didn't expose one. */
  submitterName:  string | null;
}

export function feedbackEmail(p: FeedbackTemplateParams): {
  subject:  string;
  textBody: string;
  htmlBody: string;
} {
  const from        = p.submitterName ? `${p.submitterName} (${p.submitterEmail})` : p.submitterEmail;
  const subjectName = p.submitterName ?? p.submitterEmail;
  const subject     = `New feedback: from ${subjectName}`;

  const textBody = [
    `From: ${from}`,
    ``,
    `Title: ${p.title}`,
    ``,
    `Message: ${p.body}`,
  ].join('\n');

  // Heading stays generic (not the submitter — that was too dominant); From/
  // Title/Message render as same-size body lines with only the label bold
  // (renderEmail's **label** → <strong>, plain text after it stays regular).
  const htmlBody = renderEmail({
    heading: 'New feedback',
    body: [
      `**From:** ${from}`,
      `**Title:** ${p.title}`,
      `**Message:** ${p.body}`,
    ],
  });

  return { subject, textBody, htmlBody };
}
