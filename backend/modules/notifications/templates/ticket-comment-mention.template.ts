import type { NotificationTemplate } from '../notifications.types';
import { renderEmail } from './layout';

interface TicketCommentMentionData {
  commenterName: string;
  ticketTitle:   string;
  actionUrl:     string;
}

export const ticketCommentMentionTemplate: NotificationTemplate = (raw) => {
  const d = raw as unknown as TicketCommentMentionData;
  return {
    inappText:    `${d.commenterName} mentioned you on ${d.ticketTitle}`,
    emailSubject: `${d.commenterName} mentioned you on ${d.ticketTitle}`,
    emailText:    `${d.commenterName} mentioned you in a comment on "${d.ticketTitle}".\n\nOpen in Rai: ${d.actionUrl}`,
    emailHtml:    renderEmail({
      heading: 'You were mentioned in a comment',
      body:    [`${d.commenterName} mentioned you in a comment on "${d.ticketTitle}".`],
      cta:     { text: 'View comment', url: d.actionUrl },
    }),
  };
};
