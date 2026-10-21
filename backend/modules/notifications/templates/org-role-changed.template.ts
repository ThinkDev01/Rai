import type { NotificationTemplate } from '../notifications.types';
import { renderEmail } from './layout';

interface OrgRoleChangedData {
  orgName:  string;
  roleType: string;
  actionUrl: string;
}

const ROLE_LABEL: Record<string, string> = {
  owner:           'Owner',
  admin:           'Admin',
  project_manager: 'Project Manager',
  user:            'Member',
};

export const orgRoleChangedTemplate: NotificationTemplate = (raw) => {
  const d = raw as unknown as OrgRoleChangedData;
  const label = ROLE_LABEL[d.roleType] ?? d.roleType;
  return {
    inappText:    `Your role in ${d.orgName} is now ${label}`,
    emailSubject: `Your role in ${d.orgName} changed`,
    emailText:    `Your role in ${d.orgName} is now ${label}.\n\nOpen in Rai: ${d.actionUrl}`,
    emailHtml:    renderEmail({
      heading:   `Your role in ${d.orgName} changed`,
      body:      [`Your role in ${d.orgName} is now:`],
      highlight: label,
      cta:       { text: 'Open organization', url: d.actionUrl },
    }),
  };
};
