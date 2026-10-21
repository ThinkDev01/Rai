import type { NotificationTemplate } from '../notifications.types';

interface SprintArchivedData {
  actorName:  string;
  sprintName: string;
}

// In-app only — fires to project members.
export const sprintArchivedTemplate: NotificationTemplate = (raw) => {
  const d = raw as unknown as SprintArchivedData;
  return { inappText: `${d.actorName} archived the sprint ${d.sprintName}` };
};
