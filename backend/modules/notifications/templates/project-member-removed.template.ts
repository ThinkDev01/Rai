import type { NotificationTemplate } from '../notifications.types';
import { renderEmail } from './layout';

interface ProjectMemberRemovedData {
  actorName:   string;
  projectName: string;
}

// No link — the user may no longer have access to the project.
export const projectMemberRemovedTemplate: NotificationTemplate = (raw) => {
  const d = raw as unknown as ProjectMemberRemovedData;
  return {
    inappText:    `${d.actorName} removed you from ${d.projectName}`,
    emailSubject: `You've been removed from ${d.projectName}`,
    emailText:    `${d.actorName} removed you from the project "${d.projectName}".`,
    emailHtml:    renderEmail({
      heading: `You've been removed from ${d.projectName}`,
      body:    [`${d.actorName} removed you from the project "${d.projectName}".`],
    }),
  };
};
