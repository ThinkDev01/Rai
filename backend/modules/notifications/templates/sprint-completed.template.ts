import type { NotificationTemplate } from '../notifications.types';

interface SprintCompletedData {
  actorName:  string;
  sprintName: string;
}

// In-app only — fires to project members.
export const sprintCompletedTemplate: NotificationTemplate = (raw) => {
  const d = raw as unknown as SprintCompletedData;
  return { inappText: `${d.actorName} completed the sprint ${d.sprintName}` };
};
