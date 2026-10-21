import type { NotificationTemplate } from '../notifications.types';
import { renderEmail } from './layout';

interface TicketAssignedData {
  ticketKey?:   string;
  ticketTitle:  string;
  assignerName: string;
  actionUrl:    string;
}

export const ticketAssignedTemplate: NotificationTemplate = (raw) => {
  const d = raw as unknown as TicketAssignedData;
  const label = d.ticketKey ? `${d.ticketKey}: ${d.ticketTitle}` : d.ticketTitle;
  return {
    inappText:    `${d.assignerName} assigned you ${label}`,
    emailSubject: `${d.assignerName} assigned you a ticket`,
    emailText:    `${d.assignerName} assigned you a ticket:\n\n${label}\n\nOpen in Rai: ${d.actionUrl}`,
    emailHtml:    renderEmail({
      heading:   `${d.assignerName} assigned you a ticket`,
      body:      [`${d.assignerName} assigned a ticket to you.`],
      highlight: label,
      cta:       { text: 'View ticket', url: d.actionUrl },
    }),
  };
};
