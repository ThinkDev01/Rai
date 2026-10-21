import type { NotificationTemplate } from '../notifications.types';

interface TicketDeletedData {
  actorName:   string;
  ticketKey?:  string;
  ticketTitle: string;
}

// In-app only — the ticket is gone, so there's no link and no email noise.
export const ticketDeletedTemplate: NotificationTemplate = (raw) => {
  const d = raw as unknown as TicketDeletedData;
  const label = d.ticketKey ? `${d.ticketKey}: ${d.ticketTitle}` : d.ticketTitle;
  return {
    inappText: `${d.actorName} deleted ${label}`,
  };
};
