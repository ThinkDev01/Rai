import type { NotificationTemplate } from '../notifications.types';

interface TicketCommentEditedData {
  editorName:  string;
  ticketTitle: string;
}

// In-app only by design: a comment edit shouldn't fire an email to everyone on
// the ticket (suppressing trivial edits is a v3 refinement — dev-notifications.md).
export const ticketCommentEditedTemplate: NotificationTemplate = (raw) => {
  const d = raw as unknown as TicketCommentEditedData;
  return {
    inappText: `${d.editorName} edited a comment on ${d.ticketTitle}`,
  };
};
