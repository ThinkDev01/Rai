import type { NotificationTemplate } from '../notifications.types';
import { renderEmail } from './layout';

interface ProjectDeletedData {
  actorName:   string;
  projectName: string;
  actionUrl:   string;
}

// In-app + email — deletion is permanent, so it's worth an email.
export const projectDeletedTemplate: NotificationTemplate = (raw) => {
  const d = raw as unknown as ProjectDeletedData;
  return {
    inappText:    `${d.actorName} deleted the project ${d.projectName}`,
    emailSubject: `Project deleted: ${d.projectName}`,
    emailText:    `${d.actorName} deleted the project "${d.projectName}". This is permanent — its sprints, tickets, and comments are gone.\n\nOpen Rai: ${d.actionUrl}`,
    emailHtml:    renderEmail({
      heading: 'Project deleted',
      body:    [
        `${d.actorName} deleted the project "${d.projectName}".`,
        'This is permanent — its sprints, tickets, and comments are gone.',
      ],
      cta:     { text: 'Open Rai', url: d.actionUrl },
    }),
  };
};
