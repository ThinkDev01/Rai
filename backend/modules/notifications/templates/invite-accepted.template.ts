import type { NotificationTemplate } from '../notifications.types';
import { renderEmail } from './layout';

interface InviteAcceptedData {
  inviteeName: string;
  orgName:     string;
  actionUrl:   string;
}

export const inviteAcceptedTemplate: NotificationTemplate = (raw) => {
  const d = raw as unknown as InviteAcceptedData;
  return {
    inappText:    `${d.inviteeName} accepted your invite to ${d.orgName}`,
    emailSubject: `${d.inviteeName} joined ${d.orgName} on Rai`,
    emailText:    `${d.inviteeName} accepted your invitation and joined ${d.orgName}.\n\nOpen in Rai: ${d.actionUrl}`,
    emailHtml:    renderEmail({
      heading: `${d.inviteeName} joined ${d.orgName}`,
      body:    [`${d.inviteeName} accepted your invitation and is now a member of ${d.orgName}.`],
      cta:     { text: 'Open organization', url: d.actionUrl },
    }),
  };
};
