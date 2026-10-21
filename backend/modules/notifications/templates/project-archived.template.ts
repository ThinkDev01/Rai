import type { NotificationTemplate } from '../notifications.types';

interface ProjectArchivedData {
  actorName:   string;
  projectName: string;
}

// In-app only.
export const projectArchivedTemplate: NotificationTemplate = (raw) => {
  const d = raw as unknown as ProjectArchivedData;
  return { inappText: `${d.actorName} archived the project ${d.projectName}` };
};
