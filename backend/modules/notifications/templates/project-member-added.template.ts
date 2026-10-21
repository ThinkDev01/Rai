import type { NotificationTemplate } from '../notifications.types';
import { renderEmail } from './layout';

interface ProjectMemberAddedData {
  actorName:   string;
  projectName: string;
  actionUrl:   string;
}

export const projectMemberAddedTemplate: NotificationTemplate = (raw) => {
  const d = raw as unknown as ProjectMemberAddedData;
  return {
    inappText:    `${d.actorName} added you to ${d.projectName}`,
    emailSubject: `You've been added to ${d.projectName}`,
    emailText:    `${d.actorName} added you to the project "${d.projectName}".\n\nOpen in Rai: ${d.actionUrl}`,
    emailHtml:    renderEmail({
      heading: `You've been added to ${d.projectName}`,
      body:    [`${d.actorName} added you to the project "${d.projectName}".`],
      cta:     { text: 'View project', url: d.actionUrl },
    }),
  };
};
