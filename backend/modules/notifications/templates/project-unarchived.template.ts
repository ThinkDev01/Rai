import type { NotificationTemplate } from '../notifications.types';

interface ProjectUnarchivedData {
  actorName:   string;
  projectName: string;
}

// In-app only.
export const projectUnarchivedTemplate: NotificationTemplate = (raw) => {
  const d = raw as unknown as ProjectUnarchivedData;
  return { inappText: `${d.actorName} unarchived the project ${d.projectName}` };
};
