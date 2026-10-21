// Plain-text-first invite template per docs/notifications.md.
// Templates stay in code (no Handlebars/MJML at v2 scale - typed template-per-type).
// HTML uses the shared branded email shell (renderEmail) so the invite matches
// the notification emails and the product UI.
import { renderEmail } from '../../notifications/templates/layout';

export interface InviteTemplateParams {
  inviterName:  string;
  inviterEmail: string;
  orgName:      string;
  role:         'admin' | 'project_manager' | 'user';
  acceptUrl:    string;
  expiresInDays: number;
}

const ROLE_LABEL: Record<InviteTemplateParams['role'], string> = {
  admin:           'admin',
  project_manager: 'project manager',
  user:            'member',
};

export function inviteEmail(p: InviteTemplateParams): {
  subject:  string;
  textBody: string;
  htmlBody: string;
} {
  const role    = ROLE_LABEL[p.role];
  const subject = `${p.inviterName} invited you to ${p.orgName} on Rai`;

  const textBody = [
    `Hi,`,
    ``,
    `${p.inviterName} (${p.inviterEmail}) has invited you to join ${p.orgName} on Rai as a ${role}.`,
    ``,
    `Accept the invite:`,
    p.acceptUrl,
    ``,
    `This link expires in ${p.expiresInDays} days. If you didn't expect this invitation, you can safely ignore this email.`,
    ``,
    `- The Rai team`,
  ].join('\n');

  const htmlBody = renderEmail({
    heading: `You've been invited to ${p.orgName}`,
    body:    [
      `${p.inviterName} (${p.inviterEmail}) invited you to join ${p.orgName} on Rai as a ${role}.`,
      `This invite expires in ${p.expiresInDays} days. If you didn't expect it, you can safely ignore this email.`,
    ],
    cta:     { text: 'Accept invite', url: p.acceptUrl },
  });

  return { subject, textBody, htmlBody };
}
