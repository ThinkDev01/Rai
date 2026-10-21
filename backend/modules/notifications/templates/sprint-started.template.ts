import type { NotificationTemplate } from '../notifications.types';
import { renderEmail } from './layout';

interface SprintStartedData {
  sprintName:  string;
  projectName: string;
  actionUrl:   string;   // sprint board page
}

// Fired by the sprint auto-start cron when a planned sprint reaches its start
// date — there's no human actor, so the copy is system-voiced ("auto-started").
// Goes to project members on all three channels (in-app + email + push).
export const sprintStartedTemplate: NotificationTemplate = (raw) => {
  const d = raw as unknown as SprintStartedData;
  return {
    inappText:    `The sprint ${d.sprintName} auto-started in ${d.projectName}`,
    emailSubject: `Sprint started: ${d.sprintName}`,
    emailText:
      `The sprint "${d.sprintName}" in ${d.projectName} reached its start date and is now active.\n\n` +
      `Open the sprint board: ${d.actionUrl}`,
    emailHtml: renderEmail({
      heading: `${d.sprintName} is now active`,
      body: [
        `The sprint **${d.sprintName}** in **${d.projectName}** reached its planned start date and has automatically started.`,
        `Head to the board to track progress.`,
      ],
      cta: { text: 'Open sprint board', url: d.actionUrl },
    }),
    pushTitle: 'Sprint started',
    pushBody:  `${d.sprintName} is now active in ${d.projectName}`,
  };
};
