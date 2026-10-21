import type { NotificationTemplate } from '../notifications.types';
import { renderEmail } from './layout';

interface TicketCommentNewData {
  commenterName: string;
  ticketTitle:   string;
  actionUrl:     string;
}

export const ticketCommentNewTemplate: NotificationTemplate = (raw) => {
  const d = raw as unknown as TicketCommentNewData;
  return {
    inappText:    `${d.commenterName} commented on ${d.ticketTitle}`,
    emailSubject: `New comment on ${d.ticketTitle}`,
    emailText:    `${d.commenterName} left a comment on "${d.ticketTitle}".\n\nOpen in Rai: ${d.actionUrl}`,
    emailHtml:    renderEmail({
      heading: 'New comment on your ticket',
      body:    [`${d.commenterName} left a comment on "${d.ticketTitle}".`],
      cta:     { text: 'View comment', url: d.actionUrl },
    }),
  };
};
