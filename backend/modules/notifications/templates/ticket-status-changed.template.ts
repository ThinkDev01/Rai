import type { NotificationTemplate } from '../notifications.types';

interface TicketStatusChangedData {
  actorName:   string;
  ticketKey?:  string;
  ticketTitle: string;
  newStatus:   string;
}

// In-app only (no email fields) — status churn would be noisy over email.
const STATUS_LABEL: Record<string, string> = {
  todo:        'To Do',
  in_progress: 'In Progress',
  in_review:   'In Review',
  done:        'Done',
};

export const ticketStatusChangedTemplate: NotificationTemplate = (raw) => {
  const d = raw as unknown as TicketStatusChangedData;
  const label = d.ticketKey ? `${d.ticketKey}: ${d.ticketTitle}` : d.ticketTitle;
  const status = STATUS_LABEL[d.newStatus] ?? d.newStatus;
  return {
    inappText: `${d.actorName} moved ${label} to ${status}`,
  };
};
